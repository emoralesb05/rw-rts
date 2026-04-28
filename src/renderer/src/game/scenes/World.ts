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
  hasOverride,
  ANIM,
} from "../sprite-assets";
import { drawShadow, type HeartlessRef } from "../heartless";
import { themeFor, type WorldTheme } from "../gummi-worlds";
import type {
  UnitRole,
  Heartless,
  DriveForm,
  AgentEvent,
  UnitState,
} from "@shared/events";
import { useStore } from "../../store";

const SCANLINE_TEX = "kh-scanlines";

// Sky-gradient palette per theme. Top + bottom hex colors.
const THEME_SKY: Record<WorldTheme, { top: number; bottom: number }> = {
  disney: { top: 0x153466, bottom: 0x4a82c8 },
  hollow: { top: 0x100820, bottom: 0x352052 },
  traverse: { top: 0x1a0a18, bottom: 0x4a2030 },
  destiny: { top: 0x2880c0, bottom: 0x9adcef },
  twilight: { top: 0x4a1838, bottom: 0xff89a3 },
  halloween: { top: 0x0a0418, bottom: 0x2a1438 },
};

// Color grade per theme — applied via ColorMatrix saturate/hue/contrast.
const THEME_GRADE: Record<WorldTheme, { sat: number; hue: number; contrast: number }> = {
  disney:    { sat: 0.10, hue:   2, contrast: 0.05 },
  hollow:    { sat: 0.20, hue: -10, contrast: 0.10 },
  traverse:  { sat: 0.05, hue:   8, contrast: 0.06 },
  destiny:   { sat: 0.15, hue:  -4, contrast: 0.04 },
  twilight:  { sat: 0.20, hue:  10, contrast: 0.06 },
  halloween: { sat: 0.10, hue: -15, contrast: 0.12 },
};

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

type PatrolState = "scouting" | "patrolling" | "acting";

type SpriteRef = {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  // The actual animated Phaser.Sprite (when a sheet override is loaded).
  // Held here so the per-frame anim switcher can call .play() on it
  // without traversing the body's child list each tick.
  sprite?: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Arc;
  driveAura: Phaser.GameObjects.Arc;
  selectRing: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  hpRing: Phaser.GameObjects.Arc;
  mpRing: Phaser.GameObjects.Arc;
  homeTx: number;
  homeTy: number;
  role: UnitRole;
  status: string;
  driveForm?: DriveForm;
  parentSessionId?: string;
  tether?: Phaser.GameObjects.Graphics;
  patrolState: PatrolState;
  scoutUntil: number;
  actingUntil: number;
  patrolTween?: Phaser.Tweens.Tween;
  // Last-frame container position — used to detect movement direction
  // and pick the right walk animation. Initialized in spawnSprite.
  lastX: number;
  lastY: number;
  // Animation key currently playing — kept so we don't restart a
  // looping anim every frame.
  currentAnim?: string;
};

// Per-theme arena layout — what the inside of THIS world looks like.
// Each world's interior shows ITS OWN namesake landmark at the center,
// plus a few thematic accent decorations. No cross-world landmarks.
//
// `landmark` = the central pixel-art image (loaded as `landmark-${kind}`).
// `accents` = small extra decorations placed around the arena (also pixel
// art images named `landmark-${kind}` for now; we re-use the same texture
// at smaller scale + offset positions, so the world feels populated
// without authoring extra art for v1).
const ARENA_LAYOUT: Record<
  WorldTheme,
  {
    centerLabel: string;
    centerTile: { tx: number; ty: number };
    accents: { tx: number; ty: number; scale: number; alpha: number }[];
  }
> = {
  disney: {
    centerLabel: "Disney Castle",
    centerTile: { tx: 6, ty: 3 },
    accents: [
      { tx: 2, ty: 8, scale: 1, alpha: 0.85 },
      { tx: 10, ty: 8, scale: 1, alpha: 0.85 },
    ],
  },
  hollow: {
    centerLabel: "Hollow Bastion · Keyhole",
    centerTile: { tx: 6, ty: 3 },
    accents: [
      { tx: 2, ty: 7, scale: 0.85, alpha: 0.9 },
      { tx: 10, ty: 7, scale: 0.85, alpha: 0.9 },
      { tx: 6, ty: 9, scale: 0.7, alpha: 0.75 },
    ],
  },
  traverse: {
    centerLabel: "Traverse Town · 2nd District",
    centerTile: { tx: 6, ty: 4 },
    accents: [
      { tx: 2, ty: 8, scale: 1, alpha: 0.85 },
      { tx: 10, ty: 8, scale: 1, alpha: 0.85 },
    ],
  },
  destiny: {
    centerLabel: "Destiny Islands",
    centerTile: { tx: 6, ty: 4 },
    accents: [
      { tx: 2, ty: 8, scale: 0.85, alpha: 0.85 },
      { tx: 10, ty: 6, scale: 0.85, alpha: 0.9 },
      { tx: 9, ty: 9, scale: 0.7, alpha: 0.75 },
    ],
  },
  twilight: {
    centerLabel: "Twilight Town · Clock Tower",
    centerTile: { tx: 6, ty: 3 },
    accents: [
      { tx: 2, ty: 8, scale: 0.85, alpha: 0.85 },
      { tx: 10, ty: 8, scale: 0.85, alpha: 0.85 },
    ],
  },
  halloween: {
    centerLabel: "Halloween Town · Spiral Hill",
    centerTile: { tx: 6, ty: 3 },
    accents: [
      { tx: 2, ty: 8, scale: 0.85, alpha: 0.9 },
      { tx: 10, ty: 8, scale: 0.85, alpha: 0.9 },
      { tx: 6, ty: 10, scale: 0.7, alpha: 0.75 },
    ],
  },
};

// Per-theme heartless mix — what kind of darkness this world breeds.
// Used by store to pick which heartless type spawns. Hollow Bastion gets
// the toughest mix; Destiny Islands stays mild (early-game vibe).
export const THEME_HEARTLESS_MIX: Record<
  WorldTheme,
  { shadow: number; soldier: number; largebody: number }
> = {
  disney: { shadow: 0.7, soldier: 0.3, largebody: 0 },
  hollow: { shadow: 0.3, soldier: 0.5, largebody: 0.2 },
  traverse: { shadow: 0.6, soldier: 0.35, largebody: 0.05 },
  destiny: { shadow: 0.95, soldier: 0.05, largebody: 0 },
  twilight: { shadow: 0.5, soldier: 0.45, largebody: 0.05 },
  halloween: { shadow: 0.7, soldier: 0.25, largebody: 0.05 },
};

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
  private skyGfx?: Phaser.GameObjects.Graphics;
  private timeOfDayOverlay?: Phaser.GameObjects.Rectangle;
  private scanline?: Phaser.GameObjects.TileSprite;
  private colorGrade?: Phaser.Filters.ColorMatrix;
  private sceneStartTime = 0;
  private currentTheme: WorldTheme = "disney";

  constructor() {
    super("world");
  }

  preload() {
    this.load.on("loaderror", (file: { key: string }) => {
      void file;
    });
    // Always load shipped defaults; only attempt the user override when the
    // probe (in sprite-assets) confirmed it exists. Avoids 404 noise on the
    // common no-overrides path.
    for (const role of UNIT_ROLES) {
      this.load.image(TEXTURE_DEFAULT_KEY(role), SPRITE_DEFAULT_URL(role));
      if (hasOverride(role)) {
        this.load.image(TEXTURE_KEY(role), SPRITE_URL(role));
      }
    }
    registerSpritesheetPreload(this);
    // Pixel-art landmarks (64×64) + iso ground tiles (96×48). Replace the
    // old vector primitives so the world reads as one cohesive pixel-art
    // style instead of pixel-units-on-vector-background.
    const lm = ["disney", "hollow", "traverse", "destiny", "twilight", "halloween"];
    for (const k of lm) {
      this.load.image(`landmark-${k}`, `/sprites/kh-default/landmark-${k}.png`);
    }
    this.load.image("tile-iso-a", "/sprites/kh-default/tile-iso-a.png");
    this.load.image("tile-iso-b", "/sprites/kh-default/tile-iso-b.png");
    // Pixel-art Heartless sheets — replace the primitive `drawShadow`
    // path. Frames 0..3 idle bob, 4..7 swing/lunge.
    this.load.spritesheet(
      "heartless-shadow-sheet",
      "/sprites/kh-default/heartless-shadow_sheet.png",
      { frameWidth: 32, frameHeight: 32 }
    );
    this.load.spritesheet(
      "heartless-soldier-sheet",
      "/sprites/kh-default/heartless-soldier_sheet.png",
      { frameWidth: 32, frameHeight: 32 }
    );
    this.load.spritesheet(
      "heartless-largebody-sheet",
      "/sprites/kh-default/heartless-largebody_sheet.png",
      { frameWidth: 32, frameHeight: 32 }
    );
  }

  create() {
    this.sceneStartTime = this.time.now;
    this.currentTheme = themeFor(useStore.getState().activeWorldId ?? "default");
    this.cameras.main.setBackgroundColor("#04060d");

    // ── Tier 1 filter stack ───────────────────────────────────────
    this.colorGrade = this.cameras.main.filters.internal.addColorMatrix();
    this.applyThemeGrade();
    this.cameras.main.filters.internal.addGlow(0xffd86b, 0.4, 0.2, 1, false, 4, 8);
    this.cameras.main.filters.internal.addVignette(0.5, 0.5, 0.9, 0.4);

    // ── Atmosphere layers ─────────────────────────────────────────
    this.drawSkyGradient();
    this.timeOfDayOverlay = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(-50);

    this.drawIsoGrid();
    this.placeArenaLandmarks();

    // Scanline overlay sits on top of everything
    this.ensureScanlineTexture();
    this.scanline = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, SCANLINE_TEX)
      .setOrigin(0, 0)
      .setDepth(1000)
      .setAlpha(0.4);

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
      this.skyGfx = undefined;
      this.timeOfDayOverlay = undefined;
      this.scanline = undefined;
      this.colorGrade = undefined;
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
    // If the active world changed mid-scene, refresh theme + clock.
    if (this.worldId) {
      const newTheme = themeFor(this.worldId);
      if (newTheme !== this.currentTheme) {
        this.currentTheme = newTheme;
        this.applyThemeGrade();
        if (this.skyGfx) {
          const { top, bottom } = THEME_SKY[newTheme];
          this.skyGfx.clear();
          this.skyGfx.fillGradientStyle(top, top, bottom, bottom, 1);
          this.skyGfx.fillRect(0, 0, this.scale.width, this.scale.height);
        }
        this.sceneStartTime = this.time.now;
      }
    }
    this.updateTimeOfDay();
    if (this.scanline) {
      this.scanline.tilePositionY = (this.time.now * 0.02) % 4;
    }
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

    const now = this.time.now;
    for (const ref of this.sprites.values()) {
      const ghosted = ref.status === "complete" || ref.status === "fallen";
      if (!ghosted) {
        if (ref.patrolState === "acting") {
          if (now >= ref.actingUntil) {
            ref.patrolState = "scouting";
            ref.scoutUntil = now + 400 + Math.random() * 600;
          }
        } else if (ref.patrolState === "scouting") {
          if (now >= ref.scoutUntil) this.startPatrolLeg(ref);
        }
      }
      // Animation switcher — pick the right anim based on whether the
      // unit's container moved between frames + which direction.
      // "acting" state owns its own anim (set in animateEvent), so skip.
      if (ref.sprite && ref.patrolState !== "acting" && !ghosted) {
        this.updateSpriteAnimation(ref);
      }
      ref.lastX = ref.container.x;
      ref.lastY = ref.container.y;
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
    if (this.skyGfx) {
      const { top, bottom } = THEME_SKY[this.currentTheme];
      this.skyGfx.clear();
      this.skyGfx.fillGradientStyle(top, top, bottom, bottom, 1);
      this.skyGfx.fillRect(0, 0, this.scale.width, this.scale.height);
    }
    if (this.scanline)
      this.scanline.setSize(this.scale.width, this.scale.height);
    if (this.timeOfDayOverlay)
      this.timeOfDayOverlay.setSize(this.scale.width, this.scale.height);
  }

  private applyThemeGrade() {
    if (!this.colorGrade) return;
    const g = THEME_GRADE[this.currentTheme];
    this.colorGrade.colorMatrix.reset();
    this.colorGrade.colorMatrix
      .saturate(g.sat, true)
      .hue(g.hue, true)
      .contrast(g.contrast, true);
  }

  private drawSkyGradient() {
    const { top, bottom } = THEME_SKY[this.currentTheme];
    const g = this.add.graphics();
    g.fillGradientStyle(top, top, bottom, bottom, 1);
    g.fillRect(0, 0, this.scale.width, this.scale.height);
    g.setDepth(-100);
    this.skyGfx = g;
  }

  private ensureScanlineTexture() {
    if (this.textures.exists(SCANLINE_TEX)) return;
    const c = document.createElement("canvas");
    c.width = 1;
    c.height = 4;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.fillRect(0, 0, 1, 1);
    ctx.fillRect(0, 2, 1, 1);
    this.textures.addCanvas(SCANLINE_TEX, c);
  }

  private updateTimeOfDay() {
    if (!this.timeOfDayOverlay) return;
    const ageMs = this.time.now - this.sceneStartTime;
    const ageMin = ageMs / 60000;
    // Smoothly interpolate between four palette stops based on session age.
    let color = 0x000000;
    let alpha = 0;
    if (ageMin < 3) {
      alpha = 0;
    } else if (ageMin < 10) {
      // Warm afternoon
      color = 0xffaa55;
      alpha = ((ageMin - 3) / 7) * 0.18;
    } else if (ageMin < 20) {
      color = 0xff6a3c;
      alpha = 0.18 + ((ageMin - 10) / 10) * 0.12;
    } else {
      color = 0x2a1450;
      alpha = 0.35;
    }
    this.timeOfDayOverlay.fillColor = color;
    this.timeOfDayOverlay.setAlpha(alpha);
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
    // Pixel-art iso tiles. Two checker variants. Falls back to drawn
    // graphics if the tile texture failed to load (e.g. in fixture/dev
    // before generator runs).
    const haveA = this.textures.exists("tile-iso-a");
    const haveB = this.textures.exists("tile-iso-b");
    if (!haveA || !haveB) {
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
      g.setDepth(-30);
      return;
    }
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        const center = this.isoToScreen(x + 0.5, y + 0.5);
        const tex = (x + y) % 2 === 0 ? "tile-iso-a" : "tile-iso-b";
        const tile = this.add.image(center.x, center.y, tex);
        tile.setOrigin(0.5, 0.5);
        tile.setDepth(-30);
      }
    }
  }

  private placeArenaLandmarks() {
    // Inside Hollow Bastion you see Hollow Bastion stuff, not Disney
    // Castle. Each world renders ONLY its own theme's namesake landmark
    // at the center, plus a few smaller accents. No cross-world clutter.
    const theme = this.currentTheme;
    const layout = ARENA_LAYOUT[theme];
    const texKey = `landmark-${theme}`;

    // Central namesake landmark
    const center = this.isoToScreen(layout.centerTile.tx, layout.centerTile.ty);
    if (this.textures.exists(texKey)) {
      const img = this.add.image(center.x, center.y - 36, texKey);
      img.setOrigin(0.5, 0.5);
      img.setScale(2.5);
      img.setDepth(-20);
    } else {
      // Legacy fallback while pixel landmark textures aren't loaded yet.
      const kind: "disney" | "hollow" | "traverse" =
        theme === "disney"
          ? "disney"
          : theme === "hollow"
            ? "hollow"
            : "traverse";
      drawKHBuilding(this, kind, center.x, center.y);
    }
    this.add
      .text(center.x, center.y - 110, layout.centerLabel.toUpperCase(), {
        fontSize: "11px",
        color: "#ffd86b",
        fontStyle: "bold",
        fontFamily: "ui-monospace, monospace",
      })
      .setOrigin(0.5)
      .setDepth(-19);

    // Smaller themed accents scattered around the arena.
    if (this.textures.exists(texKey)) {
      for (const a of layout.accents) {
        const p = this.isoToScreen(a.tx, a.ty);
        const img = this.add.image(p.x, p.y - 18, texKey);
        img.setOrigin(0.5, 0.5);
        img.setScale(2 * a.scale);
        img.setAlpha(a.alpha);
        img.setDepth(-21);
      }
    }

    // Make the central landmark tile clickable as a "scout point" for
    // unit AI's patrol — a deterministic anchor in the arena.
    this.fileTiles.set("center", layout.centerTile);
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
    const sprite = this.populateBody(body, unit.role);

    const hpRing = this.add
      .arc(0, 4, 22, -90, 270, false, 0xff6b8a, 0)
      .setStrokeStyle(2, 0xff6b8a, 0.85);
    const mpRing = this.add
      .arc(0, 4, 26, -90, 270, false, 0x6cc6ff, 0)
      .setStrokeStyle(2, 0x6cc6ff, 0.65);
    const label = this.add
      .text(0, -36, unit.displayName, {
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
      sprite,
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
      patrolState: "scouting",
      scoutUntil: this.time.now + 400 + Math.random() * 1800,
      actingUntil: 0,
      lastX: x,
      lastY: y,
      currentAnim: undefined,
    };
    this.updateSpriteState(ref, unit);
    return ref;
  }

  // Render the 96×144 source at scale 0.55 → 53×79 final, sized to fit
  // an iso-grid unit cleanly. Anchored bottom-center so the feet land
  // on the unit's container origin instead of the sprite's middle. The
  // returned Sprite is stored on SpriteRef for anim switching.
  private populateBody(
    body: Phaser.GameObjects.Container,
    role: UnitRole
  ): Phaser.GameObjects.Sprite | undefined {
    const sheet = getSpritesheetConfig(role, this.textures);
    if (sheet) {
      const spr = this.add.sprite(0, 0, sheet.textureKey, 0);
      // ~290×200 source × 0.7 → ~203×140 on screen. Bottom-center anchor
      // so feet land on the container origin (no per-frame y-jitter).
      spr.setScale(0.7);
      spr.setOrigin(0.5, 1);
      spr.y = 11;
      const idle = getIdleAnimKey(role);
      if (this.anims.exists(idle)) spr.play(idle);
      body.add(spr);
      return spr;
    }
    const stillKey = this.textures.exists(TEXTURE_KEY(role))
      ? TEXTURE_KEY(role)
      : this.textures.exists(TEXTURE_DEFAULT_KEY(role))
        ? TEXTURE_DEFAULT_KEY(role)
        : null;
    if (stillKey) {
      const img = this.add.image(0, 0, stillKey);
      img.setScale(0.7);
      img.setOrigin(0.5, 1);
      img.y = 11;
      body.add(img);
      return undefined;
    }
    body.add(drawKHUnit(this, role));
    return undefined;
  }

  private updateSpriteState(ref: SpriteRef, unit: UnitState) {
    if (!ref.container.scene) return;
    if (ref.role !== unit.role) {
      const palette = ROLE_PALETTE[unit.role];
      ref.body.removeAll(true);
      ref.sprite = this.populateBody(ref.body, unit.role);
      ref.glow.fillColor = palette.color;
      ref.role = unit.role;
      ref.currentAnim = undefined;
    }
    if (ref.label.text !== unit.displayName) {
      ref.label.setText(unit.displayName);
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

    // Cancel any in-flight patrol leg so the action animation doesn't fight
    // a movement tween. The patrolTween handle is on the container — kill
    // only that one to leave swing/body angle tweens untouched.
    if (ref.patrolTween) {
      ref.patrolTween.stop();
      ref.patrolTween = undefined;
    }
    ref.patrolState = "acting";
    // Generic acting window covering the longest follow-up animation.
    // Specific kinds extend it below if they take longer.
    ref.actingUntil = this.time.now + 1100;

    if (ev.kind === "tool_use") {
      const name = String(ev.payload.name ?? "");
      const role = ref.role;
      const cast =
        name === "Bash" ||
        name === "shell" ||
        name === "exec" ||
        name === "WebFetch" ||
        name === "WebSearch" ||
        name === "Task" ||
        name === "Agent";
      const animKey = cast ? ANIM.cast(role) : ANIM.attack(role);
      if (ref.sprite && this.anims.exists(animKey)) {
        const spr = ref.sprite;
        spr.play(animKey, true);
        ref.currentAnim = animKey;
        // Auto-return to idle so the unit doesn't freeze on the last
        // attack frame after the anim plays once. Also clears
        // currentAnim so the per-frame switcher can pick up cleanly.
        spr.once("animationcomplete", () => {
          if (!spr.scene || ref.patrolState !== "acting") return;
          ref.currentAnim = undefined;
        });
      }
      // Cosmetic FX layer on top of the sprite animation
      if (["Edit", "Write", "MultiEdit"].includes(name)) {
        this.moveTo(ref, "src/", () => this.swing(ref));
        ref.actingUntil = this.time.now + 1400;
      } else if (name === "Read" || name === "Grep" || name === "Glob") {
        this.moveTo(ref, "src/", () => this.bob(ref));
        ref.actingUntil = this.time.now + 1300;
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

  private pickPatrolTarget(_ref: SpriteRef): { x: number; y: number } {
    // 65% bias toward landmarks so units feel like they're "doing work";
    // 35% wander to a random tile so they don't pile up on the 3 sites.
    const sites = [...this.fileTiles.values()];
    if (Math.random() < 0.65 && sites.length > 0) {
      const t = sites[Math.floor(Math.random() * sites.length)];
      const screen = this.isoToScreen(t.tx, t.ty);
      // Offset so multiple units at the same landmark don't stack.
      return {
        x: screen.x + (Math.random() - 0.5) * 70,
        y: screen.y - 18 + (Math.random() - 0.5) * 28,
      };
    }
    const tx = 1 + Math.random() * (GRID - 2);
    const ty = 1 + Math.random() * (GRID - 2);
    return this.isoToScreen(tx, ty);
  }

  private playAnim(ref: SpriteRef, key: string, ignoreIfPlaying = true) {
    if (!ref.sprite) return;
    if (ignoreIfPlaying && ref.currentAnim === key) return;
    if (!this.anims.exists(key)) return;
    ref.sprite.play(key, true);
    ref.currentAnim = key;
  }

  // Pick the right idle/walk animation based on container position
  // delta since last frame. Movement direction → walkDown / walkUp /
  // walkSide (with horizontal flip for left). Stationary → idleFront.
  private updateSpriteAnimation(ref: SpriteRef) {
    const dx = ref.container.x - ref.lastX;
    const dy = ref.container.y - ref.lastY;
    const speed = Math.hypot(dx, dy);
    const role = ref.role;
    // Threshold tuned to the patrol speed (~65 px/s) — lower numbers
    // catch slow drift; higher avoids twitchy walk-cycle starts during
    // brief stalls in the tween.
    if (speed > 0.05) {
      let key: string;
      if (Math.abs(dx) > Math.abs(dy)) {
        key = ANIM.walkSide(role);
        ref.sprite!.setFlipX(dx < 0);
      } else if (dy > 0) {
        key = ANIM.walkDown(role);
        ref.sprite!.setFlipX(false);
      } else {
        key = ANIM.walkUp(role);
        ref.sprite!.setFlipX(false);
      }
      this.playAnim(ref, key);
    } else {
      this.playAnim(ref, ANIM.idleFront(role));
      ref.sprite!.setFlipX(false);
    }
  }

  private startPatrolLeg(ref: SpriteRef) {
    const target = this.pickPatrolTarget(ref);
    ref.patrolState = "patrolling";
    // Slow-ish tween so the world reads as "alive" without becoming jittery.
    // Tying duration to distance keeps the felt walking speed roughly
    // constant regardless of the leg length.
    const dx = target.x - ref.container.x;
    const dy = target.y - ref.container.y;
    const dist = Math.hypot(dx, dy);
    const SPEED_PX_PER_SEC = 65;
    const duration = Math.max(1800, (dist / SPEED_PX_PER_SEC) * 1000);
    ref.patrolTween = this.tweens.add({
      targets: ref.container,
      x: target.x,
      y: target.y,
      duration,
      ease: "Sine.easeInOut",
      onComplete: () => {
        if (!ref.container.scene) return;
        ref.patrolState = "scouting";
        ref.scoutUntil =
          this.time.now + 1200 + Math.random() * 2400;
        ref.patrolTween = undefined;
      },
    });
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
    const shadow = this.add.ellipse(0, 22, 22, 5, 0x000000, 0.55);
    // Pixel-art heartless sheet (rendered at 2.5× = 80×80) — falls back to
    // drawn primitive if the sheet is missing. Always wrap in a Container
    // so HeartlessRef.body stays a single type for ai/movement code.
    const body = this.add.container(0, 0);
    // h.type uses underscores ("large_body") but the sheet filename
    // doesn't ("heartless-largebody_sheet.png"). Strip underscores when
    // building the texture key so they line up.
    const sheetKey = `heartless-${h.type.replace(/_/g, "")}-sheet`;
    if (this.textures.exists(sheetKey)) {
      const spr = this.add.sprite(0, 0, sheetKey, 0);
      spr.setScale(2.5);
      this.tweens.add({
        targets: spr,
        y: { from: -1, to: 1 },
        yoyo: true,
        repeat: -1,
        duration: 600 + Math.random() * 400,
        ease: "Sine.easeInOut",
      });
      body.add(spr);
    } else {
      const drawn = drawShadow(this);
      body.add(drawn);
    }
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
