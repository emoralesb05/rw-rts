import * as Phaser from "phaser";
import { ROLE_PALETTE } from "../units";
import {
  drawKHUnit,
  drawKHBuilding,
  UNIT_ROLES,
  SPRITE_URL,
  TEXTURE_KEY,
  SPRITE_DEFAULT_URL,
  TEXTURE_DEFAULT_KEY,
} from "../draw";
import {
  registerSpritesheetPreload,
  getSpritesheetConfig,
  getIdleAnimKey,
  createRoleAnimations,
} from "../sprite-assets";
import { drawShadow, type HeartlessRef } from "../heartless";
import type {
  UnitRole,
  Heartless,
  DriveForm,
  AgentEvent,
  UnitState,
} from "@shared/events";
import { useStore } from "../../store";

const DRIVE_COLOR: Record<DriveForm, number> = {
  valor: 0xff5a3c,
  wisdom: 0x4ec9ff,
  final: 0xffd86b,
};

const DRIVE_LABEL: Record<DriveForm, string> = {
  valor: "VALOR FORM",
  wisdom: "WISDOM FORM",
  final: "FINAL FORM",
};

const TILE_W = 96;
const TILE_H = 48;
const GRID = 12;

type SpriteRef = {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  driveAura: Phaser.GameObjects.Arc;
  selectRing: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  hpRing: Phaser.GameObjects.Arc;
  mpRing: Phaser.GameObjects.Arc;
  homeTx: number;
  homeTy: number;
  role: string;
  status: string;
  driveForm?: DriveForm;
  parentSessionId?: string;
  tether?: Phaser.GameObjects.Graphics;
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
  private heartless = new Map<string, HeartlessRef>();
  private fileTiles = new Map<string, { tx: number; ty: number }>();
  private headerText!: Phaser.GameObjects.Text;
  private munnyText!: Phaser.GameObjects.Text;
  private backBtn!: Phaser.GameObjects.Text;
  private lastEventCount = -1;
  private lastUnitsKey = "";
  private lastHeartlessKey = "";
  private worldId: string | null = null;

  constructor() {
    super("world");
  }

  preload() {
    this.load.on("loaderror", (file: { key: string }) => {
      void file;
    });
    // Load both stills and animated sheets, user override + shipped default.
    // populateBody picks: sheet override → sheet default → still override →
    // still default → drawn primitives.
    for (const role of UNIT_ROLES) {
      this.load.image(TEXTURE_KEY(role), SPRITE_URL(role));
      this.load.image(TEXTURE_DEFAULT_KEY(role), SPRITE_DEFAULT_URL(role));
    }
    registerSpritesheetPreload(this);
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
    this.munnyText = this.add
      .text(this.scale.width - 20, 18, "", {
        fontSize: "13px",
        color: "#ffd86b",
        fontFamily: "ui-monospace, monospace",
      })
      .setOrigin(1, 0);
    this.backBtn = this.add
      .text(20, 44, "← back to gummi map", {
        fontSize: "11px",
        color: "#6cc6ff",
      })
      .setInteractive({ useHandCursor: true });
    this.backBtn.on("pointerdown", () => {
      useStore.getState().selectWorld(null);
    });

    // Per-unit hitPads handle pointerdown directly — no scene-level handler.

    // Burst protection — Cursor turns can fire 10–30 tool_use events in <1s.
    // Skip animations for the same unit within MIN_GAP so tween queue doesn't
    // spiral.
    const lastAnimAt = new Map<string, number>();
    const MIN_GAP_MS = 250;
    const handler = (e: Event) => {
      const ev = (e as CustomEvent<AgentEvent>).detail;
      const now = performance.now();
      const last = lastAnimAt.get(ev.sessionId) ?? 0;
      if (now - last < MIN_GAP_MS) return;
      lastAnimAt.set(ev.sessionId, now);
      this.animateEvent(ev);
    };
    window.addEventListener("kh:event", handler as EventListener);
    this.events.once("shutdown", () => {
      window.removeEventListener("kh:event", handler as EventListener);
      this.sprites.clear();
      this.heartless.clear();
      this.fileTiles.clear();
      this.lastEventCount = -1;
      this.lastUnitsKey = "";
      this.lastHeartlessKey = "";
    });

    this.scale.on("resize", () => this.repositionHeader());
    this.repositionHeader();

    // Register idle/swing animations for each role from the loaded sheets.
    createRoleAnimations(this.anims, this.textures);
  }

  update(_t: number, delta: number) {
    const state = useStore.getState();
    const ec = state.eventCount;
    this.worldId = state.activeWorldId;
    const world = this.worldId ? state.worlds[this.worldId] : null;
    const ids = world?.unitIds ?? [];
    const key = ids
      .map((id) => {
        const u = state.units[id];
        return u
          ? `${id}:${u.role}:${u.status}:${u.hp}:${u.mp}:${u.driveForm ?? ""}`
          : id;
      })
      .join("|");
    const hKey = (world?.heartless ?? []).map((h) => h.id).join(",");

    if (ec !== this.lastEventCount || key !== this.lastUnitsKey) {
      this.lastEventCount = ec;
      this.lastUnitsKey = key;
      this.syncSprites(ids.map((id) => state.units[id]).filter(Boolean));
      this.headerText.setText(world ? `▸ ${world.label}` : "");
      this.munnyText.setText(world ? `µ ${world.munny}` : "");
    }
    if (hKey !== this.lastHeartlessKey) {
      this.lastHeartlessKey = hKey;
      this.syncHeartless(world?.heartless ?? []);
    }
    this.tickHeartlessAi(delta);

    // Selection highlight — gold rotating ring on the selected unit.
    const selectedId = state.selectedUnitId;
    for (const [id, ref] of this.sprites) {
      if (id === selectedId) {
        ref.selectRing.setVisible(true);
        ref.selectRing.setStrokeStyle(2, 0xffd86b, 0.85);
        ref.selectRing.rotation = (this.time.now / 800) % (Math.PI * 2);
      } else if (ref.selectRing.visible) {
        ref.selectRing.setVisible(false);
      }
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
      // Draw tether to parent if linked
      if (ref.parentSessionId) {
        const parent = this.sprites.get(ref.parentSessionId);
        if (!ref.tether) {
          ref.tether = this.add.graphics();
          ref.tether.setDepth(-1);
        }
        ref.tether.clear();
        if (parent && parent.container.scene) {
          ref.tether.lineStyle(2, 0xffd86b, 0.5);
          ref.tether.lineBetween(
            parent.container.x,
            parent.container.y,
            ref.container.x,
            ref.container.y
          );
          // Small star bead at midpoint, animated by phase
          const mx = (parent.container.x + ref.container.x) / 2;
          const my = (parent.container.y + ref.container.y) / 2;
          const phase = (this.time.now / 600) % 1;
          ref.tether.fillStyle(0xffd86b, 0.7 - phase * 0.5);
          ref.tether.fillCircle(mx, my, 3 + phase * 4);
        }
      }
    }
  }

  private repositionHeader() {
    if (this.backBtn) this.backBtn.setPosition(20, 44);
    if (this.headerText) this.headerText.setPosition(20, 18);
    if (this.munnyText) this.munnyText.setPosition(this.scale.width - 20, 18);
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
        const ring = [a, b, c, d] as Phaser.Math.Vector2[];
        const ringClosed = [a, b, c, d, a] as Phaser.Math.Vector2[];
        g.fillPoints(ring, true);
        g.strokePoints(ringClosed);
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
        ref.tether?.destroy();
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
    const driveAura = this.add
      .circle(0, 4, 36, 0xffffff, 0)
      .setStrokeStyle(0, 0xffffff, 0)
      .setVisible(false);
    const selectRing = this.add
      .arc(0, 4, 30, 0, 360, false, 0xffd86b, 0)
      .setStrokeStyle(2, 0xffd86b, 0)
      .setVisible(false);

    const body = this.add.container(0, 0);
    this.populateBody(body, unit.role);

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

    // Use an explicit invisible "hit pad" rectangle as the interactive
    // surface, sized to cover the full visible silhouette (head + body +
    // hair). This is more reliable than relying on Container hit-area math,
    // which can drift across Phaser versions when scale is applied.
    const hitPad = this.add
      .rectangle(0, 0, 44, 64, 0xffffff, 0)
      .setOrigin(0.5, 0.5);
    hitPad.setInteractive({ useHandCursor: true });
    hitPad.setData("unitId", unit.id);
    hitPad.on("pointerdown", () => {
      useStore.getState().selectUnit(unit.id);
    });

    const container = this.add.container(x, y, [
      driveAura,
      glow,
      selectRing,
      body,
      hpRing,
      mpRing,
      label,
      hitPad,
    ]);
    container.setData("unitId", unit.id);

    this.tweens.add({
      targets: glow,
      alpha: { from: 0.18, to: 0.42 },
      yoyo: true,
      repeat: -1,
      duration: 1200 + Math.random() * 400,
    });

    if (unit.parentSessionId) {
      container.setScale(0.7);
    }

    const ref: SpriteRef = {
      container,
      body,
      glow,
      driveAura,
      selectRing,
      label,
      hpRing,
      mpRing,
      homeTx,
      homeTy,
      role: unit.role,
      status: unit.status,
      parentSessionId: unit.parentSessionId,
    };
    this.updateSpriteState(ref, unit);
    return ref;
  }

  private populateBody(body: Phaser.GameObjects.Container, role: UnitRole) {
    // Prefer animated spritesheet (override > default) → still PNG (override
    // > default) → drawn primitives.
    const sheet = getSpritesheetConfig(role, this.textures);
    if (sheet) {
      const spr = this.add.sprite(0, 0, sheet.textureKey, 0);
      spr.setScale(Math.min(40 / sheet.frameWidth, 56 / sheet.frameHeight));
      const idle = getIdleAnimKey(role);
      if (this.anims.exists(idle)) spr.play(idle);
      body.add(spr);
      return;
    }
    const stillKey = this.textures.exists(TEXTURE_KEY(role))
      ? TEXTURE_KEY(role)
      : this.textures.exists(TEXTURE_DEFAULT_KEY(role))
        ? TEXTURE_DEFAULT_KEY(role)
        : null;
    if (stillKey) {
      const img = this.add.image(0, 0, stillKey);
      img.setScale(Math.min(40 / img.width, 56 / img.height));
      body.add(img);
      return;
    }
    body.add(drawKHUnit(this, role));
  }

  private updateSpriteState(ref: SpriteRef, unit: UnitState) {
    if (!ref.container.scene) return;
    if (ref.role !== unit.role) {
      const palette = ROLE_PALETTE[unit.role];
      ref.body.removeAll(true);
      this.populateBody(ref.body, unit.role);
      ref.glow.fillColor = palette.color;
      ref.label.setText(palette.label);
      ref.role = unit.role;
    }
    const prevStatus = ref.status;
    ref.status = unit.status;
    if (prevStatus !== unit.status) {
      if (unit.status === "fallen") this.deathPose(ref);
      else if (unit.status === "complete") this.victoryPose(ref);
    }
    const ghosted = unit.status === "complete" || unit.status === "fallen";
    ref.container.setAlpha(ghosted ? 0.35 : 1);
    const hpPct = Math.max(0, Math.min(1, unit.hp / 100));
    const mpPct = Math.max(0, Math.min(1, unit.mp / 100));
    ref.hpRing.endAngle = -90 + 360 * hpPct;
    ref.mpRing.endAngle = -90 + 360 * mpPct;
    if (ref.parentSessionId !== unit.parentSessionId) {
      ref.parentSessionId = unit.parentSessionId;
      ref.container.setScale(unit.parentSessionId ? 0.7 : 1);
    }
    if (ref.driveForm !== unit.driveForm) {
      this.applyDriveForm(ref, unit.driveForm);
    }
  }

  private applyDriveForm(ref: SpriteRef, drive: DriveForm | undefined) {
    const prev = ref.driveForm;
    ref.driveForm = drive;
    if (!drive) {
      ref.driveAura.setVisible(false);
      ref.driveAura.setAlpha(0);
      this.tweens.killTweensOf(ref.driveAura);
      return;
    }
    const color = DRIVE_COLOR[drive];
    ref.driveAura.setVisible(true);
    ref.driveAura.fillColor = color;
    ref.driveAura.setAlpha(0.15);
    ref.driveAura.setStrokeStyle(2, color, 0.85);
    this.tweens.killTweensOf(ref.driveAura);
    this.tweens.add({
      targets: ref.driveAura,
      alpha: { from: 0.18, to: 0.42 },
      yoyo: true,
      repeat: -1,
      duration: 700,
    });
    if (prev !== drive) this.driveActivationFlash(ref, drive, color);
  }

  private victoryPose(ref: SpriteRef) {
    if (!ref.container.scene) return;
    const x = ref.container.x;
    const y = ref.container.y;
    // light beam from above — wide vertical column that fades.
    const beam = this.add.rectangle(x, y - 80, 26, 200, 0xffd86b, 0.45);
    beam.setOrigin(0.5, 0);
    this.tweens.add({
      targets: beam,
      alpha: 0,
      duration: 1400,
      onComplete: () => beam.destroy(),
    });
    // Keyblade-raise: scale up + tiny upward hop, body angle wobble.
    this.tweens.add({
      targets: ref.body,
      angle: { from: -10, to: 10 },
      yoyo: true,
      repeat: 1,
      duration: 200,
    });
    this.tweens.add({
      targets: ref.container,
      y: y - 14,
      yoyo: true,
      duration: 380,
      ease: "Sine.easeOut",
    });
    // Star burst overhead.
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      const star = this.add.star(x, y - 20, 5, 2, 5, 0xffd86b);
      this.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * 38,
        y: y - 20 + Math.sin(angle) * 38,
        alpha: 0,
        scale: 0.3,
        duration: 800,
        onComplete: () => star.destroy(),
      });
    }
    // CLEAR banner.
    const banner = this.add
      .text(x, y - 64, "CLEAR", {
        fontSize: "14px",
        color: "#ffd86b",
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: banner,
      y: y - 90,
      alpha: 0,
      duration: 1400,
      ease: "Sine.easeOut",
      onComplete: () => banner.destroy(),
    });
  }

  private deathPose(ref: SpriteRef) {
    if (!ref.container.scene) return;
    const x = ref.container.x;
    const y = ref.container.y;
    // Body slumps + tilts.
    this.tweens.add({
      targets: ref.body,
      angle: 75,
      y: 8,
      duration: 600,
      ease: "Quad.easeIn",
    });
    // Dark heart escapes — opposite of the heartless death flourish.
    const heart = this.add.star(x, y, 4, 3, 8, 0x4a2070);
    heart.setStrokeStyle(1, 0x9d6bff, 0.85);
    this.tweens.add({
      targets: heart,
      y: y - 50,
      alpha: 0,
      angle: -360,
      duration: 1100,
      onComplete: () => heart.destroy(),
    });
    // KO banner.
    const banner = this.add
      .text(x, y - 50, "K.O.", {
        fontSize: "13px",
        color: "#ff5a3c",
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: banner,
      y: y - 80,
      alpha: 0,
      duration: 1400,
      onComplete: () => banner.destroy(),
    });
  }

  private driveActivationFlash(
    ref: SpriteRef,
    drive: DriveForm,
    color: number
  ) {
    // Bright expanding ring + name banner that floats up and fades.
    const x = ref.container.x;
    const y = ref.container.y;
    const ring = this.add.circle(x, y + 4, 30, color, 0).setStrokeStyle(3, color, 1);
    this.tweens.add({
      targets: ring,
      radius: 90,
      alpha: 0,
      duration: 600,
      onComplete: () => ring.destroy(),
    });
    const banner = this.add
      .text(x, y - 60, DRIVE_LABEL[drive], {
        fontSize: "11px",
        color: "#" + color.toString(16).padStart(6, "0"),
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.6)",
        padding: { x: 6, y: 2 },
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: banner,
      y: y - 90,
      alpha: 0,
      duration: 1100,
      ease: "Sine.easeOut",
      onComplete: () => banner.destroy(),
    });
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

  private syncHeartless(list: Heartless[]) {
    const seen = new Set<string>();
    for (const h of list) {
      seen.add(h.id);
      if (this.heartless.has(h.id)) continue;
      this.spawnHeartlessVisual(h);
    }
    for (const [id, ref] of this.heartless) {
      if (!seen.has(id)) {
        this.poofHeartless(ref);
        this.heartless.delete(id);
      }
    }
  }

  private spawnHeartlessVisual(h: Heartless) {
    // Spawn at a random edge tile so they crawl in from the dark border —
    // this reads as "invasion" rather than just popping in.
    const edge = Math.floor(Math.random() * 4);
    let tx = 0;
    let ty = 0;
    switch (edge) {
      case 0:
        tx = Math.random() * GRID;
        ty = -1;
        break;
      case 1:
        tx = GRID;
        ty = Math.random() * GRID;
        break;
      case 2:
        tx = Math.random() * GRID;
        ty = GRID;
        break;
      case 3:
        tx = -1;
        ty = Math.random() * GRID;
        break;
    }
    const { x, y } = this.isoToScreen(tx, ty);
    const shadow = this.add.ellipse(0, 12, 22, 6, 0x000000, 0.5);
    const body = drawShadow(this);
    const container = this.add.container(x, y, [shadow, body]);
    container.setScale(0.2);
    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 320,
      ease: "Back.easeOut",
    });
    // ground-rise pre-roll: pulse a dark splotch where they emerge
    const splotch = this.add.ellipse(x, y + 12, 30, 10, 0x05050a, 0.7);
    this.tweens.add({
      targets: splotch,
      scale: 1.6,
      alpha: 0,
      duration: 420,
      onComplete: () => splotch.destroy(),
    });
    this.heartless.set(h.id, {
      id: h.id,
      type: h.type,
      targetUnitId: h.targetUnitId,
      container,
      body,
      shadow,
      bobOffset: Math.random() * Math.PI * 2,
      lastLungeAt: 0,
    });
  }

  private poofHeartless(ref: HeartlessRef) {
    if (!ref.container.scene) return;
    const x = ref.container.x;
    const y = ref.container.y;
    // central released heart — the KH visual cue for a Heartless dying
    const heart = this.add.star(x, y - 4, 4, 3, 8, 0xff89a3);
    heart.setStrokeStyle(1, 0xffffff, 0.9);
    this.tweens.add({
      targets: heart,
      y: y - 36,
      alpha: 0,
      angle: 360,
      duration: 700,
      onComplete: () => heart.destroy(),
    });
    // dark dispersion puffs
    for (let i = 0; i < 5; i++) {
      const p = this.add.circle(x, y, 3, 0x05050a, 0.95);
      const angle = (Math.PI * 2 * i) / 5 + Math.random() * 0.4;
      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * 26,
        y: y + Math.sin(angle) * 26,
        alpha: 0,
        scale: 0.2,
        duration: 460,
        onComplete: () => p.destroy(),
      });
    }
    this.tweens.add({
      targets: ref.container,
      scale: 0,
      alpha: 0,
      duration: 240,
      onComplete: () => ref.container.destroy(),
    });
  }

  private tickHeartlessAi(delta: number) {
    if (this.heartless.size === 0) return;
    const dt = delta / 1000;
    const SPEED = 70;
    const ATTACK_RANGE = 38;
    const LUNGE_COOLDOWN = 1100;
    for (const ref of this.heartless.values()) {
      if (!ref.container.scene) continue;
      // pick the target sprite (or fallback: scene center)
      let targetX = this.scale.width / 2;
      let targetY = this.scale.height / 2;
      if (ref.targetUnitId) {
        const sprite = this.sprites.get(ref.targetUnitId);
        if (sprite && sprite.container.scene) {
          targetX = sprite.container.x;
          targetY = sprite.container.y - 4;
        }
      }
      const dx = targetX - ref.container.x;
      const dy = targetY - ref.container.y;
      const dist = Math.hypot(dx, dy);
      if (dist > ATTACK_RANGE) {
        ref.container.x += (dx / dist) * SPEED * dt;
        ref.container.y += (dy / dist) * SPEED * dt;
      } else {
        // close enough — periodic lunge attack
        const now = this.time.now;
        if (now - ref.lastLungeAt > LUNGE_COOLDOWN) {
          ref.lastLungeAt = now;
          const baseX = ref.container.x;
          const baseY = ref.container.y;
          this.tweens.add({
            targets: ref.container,
            x: baseX + (dx / dist) * 14,
            y: baseY + (dy / dist) * 14,
            yoyo: true,
            duration: 140,
            ease: "Quad.easeOut",
          });
        }
      }
      // bob + face target
      const phase = this.time.now / 250 + ref.bobOffset;
      ref.body.y = Math.sin(phase) * 1.6;
      ref.body.scaleX = dx < 0 ? -1 : 1;
    }
  }
}
