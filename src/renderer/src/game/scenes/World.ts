import Phaser from "phaser";
import { ROLE_PALETTE } from "../units";
import {
  drawKHUnit,
  drawKHBuilding,
  UNIT_ROLES,
  SPRITE_URL,
  TEXTURE_KEY,
} from "../draw";
import { useStore } from "../../store";
import type { AgentEvent, UnitState } from "@shared/events";

const TILE_W = 96;
const TILE_H = 48;
const GRID = 12;

type SpriteRef = {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  hpRing: Phaser.GameObjects.Arc;
  mpRing: Phaser.GameObjects.Arc;
  homeTx: number;
  homeTy: number;
  role: string;
  status: string;
};

const FILE_SITES: {
  name: string;
  tx: number;
  ty: number;
  kind: "disney" | "hollow" | "traverse";
  label: string;
}[] = [
  { name: "src/", tx: 3, ty: 3, kind: "disney", label: "Disney Castle" },
  { name: ".git/", tx: 9, ty: 2, kind: "hollow", label: "Hollow Bastion" },
  {
    name: "node_modules/",
    tx: 6,
    ty: 9,
    kind: "traverse",
    label: "Traverse Town",
  },
];

export class WorldScene extends Phaser.Scene {
  private sprites = new Map<string, SpriteRef>();
  private fileTiles = new Map<string, { tx: number; ty: number }>();
  private headerText!: Phaser.GameObjects.Text;
  private backBtn!: Phaser.GameObjects.Text;
  private lastEventCount = -1;
  private lastUnitsKey = "";
  private worldId: string | null = null;

  constructor() {
    super("world");
  }

  preload() {
    this.load.on("loaderror", (file: { key: string }) => {
      void file;
    });
    for (const role of UNIT_ROLES) {
      this.load.image(TEXTURE_KEY(role), SPRITE_URL(role));
    }
  }

  create() {
    this.cameras.main.setBackgroundColor("#04060d");
    this.drawIsoGrid();
    this.placeFileBuildings();

    this.headerText = this.add.text(20, 18, "", {
      fontSize: "16px",
      color: "#ffd86b",
      fontFamily: "system-ui",
      fontStyle: "bold",
    });
    this.backBtn = this.add
      .text(20, 44, "← back to gummi map", {
        fontSize: "11px",
        color: "#6cc6ff",
      })
      .setInteractive({ useHandCursor: true });
    this.backBtn.on("pointerdown", () => {
      useStore.getState().selectWorld(null);
    });

    this.input.on(
      "pointerdown",
      (_p: Phaser.Input.Pointer, targets: Phaser.GameObjects.GameObject[]) => {
        const hit = targets.find((t) => t.getData("unitId"));
        if (hit)
          useStore.getState().selectUnit(hit.getData("unitId") as string);
      }
    );

    const handler = (e: Event) => {
      const ev = (e as CustomEvent<AgentEvent>).detail;
      this.animateEvent(ev);
    };
    window.addEventListener("kh:event", handler as EventListener);
    this.events.once("shutdown", () => {
      window.removeEventListener("kh:event", handler as EventListener);
      this.sprites.clear();
      this.fileTiles.clear();
      this.lastEventCount = -1;
      this.lastUnitsKey = "";
    });

    this.scale.on("resize", () => this.repositionHeader());
    this.repositionHeader();
  }

  update() {
    const state = useStore.getState();
    const ec = state.eventCount;
    this.worldId = state.activeWorldId;
    const world = this.worldId ? state.worlds[this.worldId] : null;
    const ids = world?.unitIds ?? [];
    const key = ids
      .map((id) => {
        const u = state.units[id];
        return u ? `${id}:${u.role}:${u.status}:${u.hp}:${u.mp}` : id;
      })
      .join("|");

    if (ec !== this.lastEventCount || key !== this.lastUnitsKey) {
      this.lastEventCount = ec;
      this.lastUnitsKey = key;
      this.syncSprites(ids.map((id) => state.units[id]).filter(Boolean));
      this.headerText.setText(world ? `▸ ${world.label}` : "");
    }

    for (const ref of this.sprites.values()) {
      const home = this.isoToScreen(ref.homeTx, ref.homeTy);
      if (ref.status === "idle") {
        const dx = home.x - ref.container.x;
        const dy = home.y - ref.container.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
          ref.container.x += dx * 0.05;
          ref.container.y += dy * 0.05;
        }
      }
    }
  }

  private repositionHeader() {
    if (this.backBtn) this.backBtn.setPosition(20, 44);
    if (this.headerText) this.headerText.setPosition(20, 18);
  }

  private isoToScreen(tx: number, ty: number) {
    const ox = this.scale.width / 2;
    const oy = 130;
    return {
      x: ox + (tx - ty) * (TILE_W / 2),
      y: oy + (tx + ty) * (TILE_H / 2),
    };
  }

  private drawIsoGrid() {
    const g = this.add.graphics();
    g.lineStyle(1, 0x1d2851, 0.6);
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        const a = this.isoToScreen(x, y);
        const b = this.isoToScreen(x + 1, y);
        const c = this.isoToScreen(x + 1, y + 1);
        const d = this.isoToScreen(x, y + 1);
        const fill = (x + y) % 2 === 0 ? 0x0a1130 : 0x0d1638;
        g.fillStyle(fill, 1);
        g.fillPoints([a, b, c, d], true);
        g.strokePoints([a, b, c, d, a]);
      }
    }
  }

  private placeFileBuildings() {
    for (const s of FILE_SITES) {
      const { x, y } = this.isoToScreen(s.tx, s.ty);
      drawKHBuilding(this, s.kind, x, y);
      this.add
        .text(x, y - 88, s.label, {
          fontSize: "11px",
          color: "#ffd86b",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
      this.add
        .text(x, y + 16, s.name, {
          fontSize: "9px",
          color: "#8aa0d0",
          fontFamily: "ui-monospace, monospace",
        })
        .setOrigin(0.5);
      this.fileTiles.set(s.name, { tx: s.tx, ty: s.ty });
    }
  }

  private syncSprites(units: UnitState[]) {
    const seen = new Set<string>();
    units.forEach((u, i) => {
      seen.add(u.id);
      let ref = this.sprites.get(u.id);
      if (!ref) {
        ref = this.spawnSprite(u, i);
        this.sprites.set(u.id, ref);
      } else {
        this.updateSpriteState(ref, u);
      }
    });
    for (const [id, ref] of this.sprites) {
      if (!seen.has(id)) {
        ref.container.destroy(true);
        this.sprites.delete(id);
      }
    }
  }

  private spawnSprite(unit: UnitState, index: number): SpriteRef {
    const palette = ROLE_PALETTE[unit.role];
    const ringSize = 6;
    const ring = Math.floor(index / ringSize);
    const slot = index % ringSize;
    const homeTx = 1 + slot + ring;
    const homeTy = GRID - 2 - slot;
    const { x, y } = this.isoToScreen(homeTx, homeTy);

    const glow = this.add.circle(0, 6, 20, palette.color, 0.28);

    const body = this.add.container(0, 0);
    const overrideKey = TEXTURE_KEY(unit.role);
    if (this.textures.exists(overrideKey)) {
      const img = this.add.image(0, 0, overrideKey);
      img.setScale(Math.min(36 / img.width, 48 / img.height));
      body.add(img);
    } else {
      body.add(drawKHUnit(this, unit.role));
    }

    const hpRing = this.add
      .arc(0, 4, 22, -90, 270, false, 0xff6b8a, 0)
      .setStrokeStyle(2, 0xff6b8a, 0.85);
    const mpRing = this.add
      .arc(0, 4, 26, -90, 270, false, 0x6cc6ff, 0)
      .setStrokeStyle(2, 0x6cc6ff, 0.65);
    const label = this.add
      .text(0, -36, palette.label, {
        fontSize: "10px",
        color: "#e6ecff",
        backgroundColor: "rgba(0,0,0,0.55)",
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5);

    const container = this.add.container(x, y, [
      glow,
      body,
      hpRing,
      mpRing,
      label,
    ]);
    container.setSize(40, 60);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-20, -32, 40, 60),
      Phaser.Geom.Rectangle.Contains
    );
    container.setData("unitId", unit.id);

    this.tweens.add({
      targets: glow,
      alpha: { from: 0.18, to: 0.42 },
      yoyo: true,
      repeat: -1,
      duration: 1200 + Math.random() * 400,
    });

    const ref: SpriteRef = {
      container,
      body,
      glow,
      label,
      hpRing,
      mpRing,
      homeTx,
      homeTy,
      role: unit.role,
      status: unit.status,
    };
    this.updateSpriteState(ref, unit);
    return ref;
  }

  private updateSpriteState(ref: SpriteRef, unit: UnitState) {
    if (!ref.container.scene) return;
    if (ref.role !== unit.role) {
      const palette = ROLE_PALETTE[unit.role];
      ref.body.removeAll(true);
      const overrideKey = TEXTURE_KEY(unit.role);
      if (this.textures.exists(overrideKey)) {
        const img = this.add.image(0, 0, overrideKey);
        img.setScale(Math.min(36 / img.width, 48 / img.height));
        ref.body.add(img);
      } else {
        ref.body.add(drawKHUnit(this, unit.role));
      }
      ref.glow.fillColor = palette.color;
      ref.label.setText(palette.label);
      ref.role = unit.role;
    }
    ref.status = unit.status;
    const ghosted = unit.status === "complete" || unit.status === "fallen";
    ref.container.setAlpha(ghosted ? 0.35 : 1);
    const hpPct = Math.max(0, Math.min(1, unit.hp / 100));
    const mpPct = Math.max(0, Math.min(1, unit.mp / 100));
    ref.hpRing.endAngle = -90 + 360 * hpPct;
    ref.mpRing.endAngle = -90 + 360 * mpPct;
  }

  private animateEvent(ev: AgentEvent) {
    if (!this.scene?.isActive()) return;
    const ref = this.sprites.get(ev.sessionId);
    if (!ref || !ref.container.scene) return;

    if (ev.kind === "tool_use") {
      const name = String(ev.payload.name ?? "");
      if (["Edit", "Write", "MultiEdit"].includes(name)) {
        this.moveTo(ref, "src/", () => this.swing(ref));
      } else if (name === "Read" || name === "Grep" || name === "Glob") {
        this.moveTo(ref, "src/", () => this.bob(ref));
      } else if (name === "Bash") {
        this.cast(ref, 0xff6b8a);
      } else if (name === "WebFetch" || name === "WebSearch") {
        this.cast(ref, 0x6cc6ff);
      } else if (name === "Task" || name === "Agent") {
        this.summon(ref);
      } else {
        this.bob(ref);
      }
    } else if (ev.kind === "error") {
      this.shake(ref);
    }
  }

  private moveTo(ref: SpriteRef, fileName: string, after?: () => void) {
    const tile = this.fileTiles.get(fileName);
    if (!tile) {
      after?.();
      return;
    }
    const { x, y } = this.isoToScreen(tile.tx, tile.ty);
    this.tweens.add({
      targets: ref.container,
      x,
      y: y - 18,
      duration: 500,
      ease: "Sine.easeInOut",
      onComplete: () => after?.(),
    });
  }

  private swing(ref: SpriteRef) {
    this.tweens.add({
      targets: ref.body,
      angle: { from: -28, to: 28 },
      yoyo: true,
      repeat: 1,
      duration: 90,
    });
    const flash = this.add.circle(
      ref.container.x,
      ref.container.y - 6,
      4,
      0xffd86b,
      0.9
    );
    this.tweens.add({
      targets: flash,
      radius: 22,
      alpha: 0,
      duration: 350,
      onComplete: () => flash.destroy(),
    });
  }

  private bob(ref: SpriteRef) {
    this.tweens.add({
      targets: ref.container,
      y: ref.container.y - 8,
      yoyo: true,
      repeat: 2,
      duration: 110,
    });
  }

  private cast(ref: SpriteRef, color: number) {
    for (let i = 0; i < 2; i++) {
      const ring = this.add
        .circle(ref.container.x, ref.container.y, 4, color, 0.55)
        .setStrokeStyle(2, color);
      this.tweens.add({
        targets: ring,
        radius: 38,
        alpha: 0,
        duration: 520,
        delay: i * 120,
        onComplete: () => ring.destroy(),
      });
    }
  }

  private summon(ref: SpriteRef) {
    const star = this.add.star(
      ref.container.x,
      ref.container.y - 36,
      5,
      5,
      12,
      0xffd86b
    );
    this.tweens.add({
      targets: star,
      angle: 360,
      y: star.y - 12,
      alpha: 0,
      duration: 720,
      onComplete: () => star.destroy(),
    });
  }

  private shake(ref: SpriteRef) {
    const baseX = ref.container.x;
    this.tweens.add({
      targets: ref.container,
      x: baseX + 5,
      yoyo: true,
      repeat: 4,
      duration: 50,
      onComplete: () => (ref.container.x = baseX),
    });
  }
}
