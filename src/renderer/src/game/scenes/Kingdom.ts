/**
 * KingdomScene — the unified Star Chart.
 *
 * Replaces the old 3-scene drill-down (Throne / Gummi / Arena) with a single
 * pan/zoom canvas where every world is visible simultaneously. Camera
 * controls: drag-pan with mouse, scroll-wheel zoom. Click a world to select
 * its first wielder + pan camera to it.
 *
 * Q40 architecture (vision.md):
 * - Q40.1 Throne fate: side overlay panel (React) — handled outside this scene.
 * - Q40.2 Camera: strict manual + click-card-to-pan.
 * - Q40.3 Layout: constellation clustering (hash placeholder for spike).
 * - Q40.4 Zoom-out rendering: single rendering scaled by camera (no LoD steps).
 *
 * Spike scope: planet rendering + atmosphere + camera control. Iso-plane
 * rendering + wielder sprites + heartless will be ported from World.ts in
 * subsequent iterations (tasks #14, #15, #16).
 */

import * as Phaser from "phaser";
import { useStore } from "../../store";
import type {
  AgentEvent,
  UnitState,
  WorldState,
  WorldAlertLevel,
  DriveForm,
} from "@shared/events";
import { themeFor, themeLabel, type WorldTheme } from "../gummi-worlds";
import { ROLE_PALETTE } from "../units";
import {
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
import type { Heartless } from "@shared/events";

// Drive form aura colors — match the KH visual language.
const DRIVE_COLORS: Record<DriveForm, number> = {
  valor: 0xff5a3c,   // red
  wisdom: 0x6cc6ff,  // blue
  final: 0xffd86b,   // gold
};

const SCANLINE_TEX = "kh-kingdom-scanlines";

// Per-world iso plane geometry. Smaller than the legacy WorldScene grid
// (was 12×12 with TILE_W=96/TILE_H=48); shrunk to fit cluster spacing.
const ISO_TILE_W = 64;
const ISO_TILE_H = 32;
const ISO_GRID = 6;
// Container scale to fit a per-world iso plane in roughly a 230×230 box,
// matching the cluster inner-ring spacing. Worlds are positioned by the
// cluster layout; this scale just makes their internal renderings fit.
const ISO_CONTAINER_SCALE = 0.55;

// Per-theme landmark: at the center of the iso plane. Texture key
// matches the loader pattern landmark-${theme}.
const LANDMARK_TEX = (theme: WorldTheme) => `landmark-${theme}`;

// Themed accent positions per theme (offsets from the iso center, in
// per-world iso coordinates). Bumped from 2 to 4-5 per theme so each
// world reads as populated rather than sparse (Phase 2A — per-world
// signature decorations beyond MVP one-each).
const THEME_ACCENTS: Record<
  WorldTheme,
  { tx: number; ty: number; scale: number; alpha: number }[]
> = {
  disney: [
    { tx: 1, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 0.5, ty: 1.5, scale: 0.45, alpha: 0.6 },
    { tx: 4.5, ty: 1.5, scale: 0.45, alpha: 0.6 },
    { tx: 2.5, ty: 5.2, scale: 0.5, alpha: 0.7 },
  ],
  hollow: [
    { tx: 1, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 4, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 1.2, ty: 1.2, scale: 0.5, alpha: 0.75 },
    { tx: 3.8, ty: 1.2, scale: 0.5, alpha: 0.75 },
  ],
  traverse: [
    { tx: 1, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 0.6, ty: 0.6, scale: 0.5, alpha: 0.7 },
    { tx: 4.4, ty: 0.6, scale: 0.5, alpha: 0.7 },
    { tx: 2.5, ty: 5.5, scale: 0.55, alpha: 0.75 },
  ],
  destiny: [
    { tx: 1, ty: 4, scale: 0.6, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 0.4, ty: 2.5, scale: 0.4, alpha: 0.65 },
    { tx: 4.6, ty: 2.5, scale: 0.4, alpha: 0.65 },
    { tx: 2.5, ty: 5.6, scale: 0.5, alpha: 0.7 },
  ],
  twilight: [
    { tx: 1, ty: 4, scale: 0.6, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.6, alpha: 0.85 },
    { tx: 1.2, ty: 1.5, scale: 0.45, alpha: 0.65 },
    { tx: 3.8, ty: 1.5, scale: 0.45, alpha: 0.65 },
    { tx: 2.5, ty: 5.2, scale: 0.5, alpha: 0.7 },
  ],
  halloween: [
    { tx: 1, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 4, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 0.5, ty: 1, scale: 0.5, alpha: 0.8 },
    { tx: 4.5, ty: 1, scale: 0.5, alpha: 0.8 },
    { tx: 2.5, ty: 5.5, scale: 0.55, alpha: 0.85 },
  ],
};

// Per-theme particle palette: small drifting motes inside the world's
// iso footprint. Color + count + speed varies per theme to give each
// world a distinct atmospheric voice.
type ThemeParticle = { color: number; count: number; speed: number; size: number };
const THEME_PARTICLES: Record<WorldTheme, ThemeParticle> = {
  disney:    { color: 0xffd86b, count: 8,  speed: 0.04, size: 1.2 }, // gold sparkle
  hollow:    { color: 0xc9a4ff, count: 12, speed: 0.06, size: 1.0 }, // dark embers
  traverse:  { color: 0xffd86b, count: 6,  speed: 0.05, size: 1.2 }, // lamp dust
  destiny:   { color: 0xb3e0ff, count: 10, speed: 0.05, size: 1.0 }, // sea spray
  twilight:  { color: 0xffb86c, count: 8,  speed: 0.05, size: 1.2 }, // dusk fireflies
  halloween: { color: 0xff7a4a, count: 14, speed: 0.07, size: 1.2 }, // ash flecks
};

const ALERT_RING_COLOR: Record<WorldAlertLevel, number> = {
  idle: 0x2a3556,
  active: 0x6cc6ff,
  warning: 0xffb86c,
  danger: 0xff5a3c,
  cleared: 0xffd86b,
};

type WielderRef = {
  unitId: string;
  role: UnitState["role"];
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Arc;
  driveAura: Phaser.GameObjects.Arc;
  hpRing: Phaser.GameObjects.Arc;
  mpRing: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
  homeTx: number;
  homeTy: number;
  // Patrol state machine.
  patrolState: "scouting" | "walking" | "arrived";
  patrolTarget?: { tx: number; ty: number };
  patrolNextSwitchAt: number;
  // Last-known status, for change detection (death/victory pose, etc).
  lastStatus: UnitState["status"];
  lastDriveForm?: DriveForm;
  // Animation lockout — most recent event-driven anim trigger time.
  // Per-wielder so we don't spam attack/cast frames during bursts.
  lastEventAnimAt: number;
  currentAnim?: string;
  // Subagent tether to parent (rendered on the same isoPlane container).
  tether?: Phaser.GameObjects.Graphics;
  parentSessionId?: string;
  // Composite-form banner — shown on the parent when 1+ subagents are
  // alive in the same world. "Pair" / "Royal Guard" / "Wayfinder Trio".
  compositeBanner?: Phaser.GameObjects.Text;
};

type WorldRef = {
  worldId: string;
  container: Phaser.GameObjects.Container;
  isoPlane: Phaser.GameObjects.Container;
  todOverlay: Phaser.GameObjects.Rectangle;
  alertRing: Phaser.GameObjects.Arc;
  countText: Phaser.GameObjects.Text;
  countBg: Phaser.GameObjects.Rectangle;
  theme: WorldTheme;
  alertLevel: WorldAlertLevel;
  spawnedAt: number;
  wielders: Map<string, WielderRef>;
  heartless: Map<string, HeartlessRef>;
  particles: { circle: Phaser.GameObjects.Arc; vx: number; vy: number; baseAlpha: number; phase: number }[];
};

type ClusterRef = {
  key: string;
  centroid: { x: number; y: number };
  label: Phaser.GameObjects.Text;
};

type StarRef = {
  circle: Phaser.GameObjects.Arc;
  twinklePhase: number;
  baseAlpha: number;
};

export class KingdomScene extends Phaser.Scene {
  private worlds = new Map<string, WorldRef>();
  private clusters = new Map<string, ClusterRef>();
  private layout = new Map<string, { x: number; y: number; clusterKey: string }>();
  private skyGfx?: Phaser.GameObjects.Graphics;
  private scanline?: Phaser.GameObjects.TileSprite;
  private stars: StarRef[] = [];
  private dragOriginScroll: { x: number; y: number } | null = null;
  private dragOriginPointer: { x: number; y: number } | null = null;
  private didDrag = false;
  private lastWorldsKey = "";
  private lastCameraTargetVersion = 0;
  private lastUserCamMs = 0;
  private t = 0;
  // Tier 3 filter handles — held so KO + seal pulses can tween amplitudes.
  private bloomFilter?: Phaser.Filters.Glow;
  private barrelFilter?: Phaser.Filters.Barrel;
  private pixelateFilter?: Phaser.Filters.Pixelate;

  constructor() {
    super("kingdom");
  }

  preload() {
    // Pixel-art landmarks (one per theme) + iso ground tiles. Same files
    // the legacy WorldScene loaded; KingdomScene now owns them.
    const themes: WorldTheme[] = [
      "disney", "hollow", "traverse", "destiny", "twilight", "halloween",
    ];
    for (const t of themes) {
      this.load.image(LANDMARK_TEX(t), `/sprites/kh-default/${LANDMARK_TEX(t)}.png`);
    }
    this.load.image("tile-iso-a", "/sprites/kh-default/tile-iso-a.png");
    this.load.image("tile-iso-b", "/sprites/kh-default/tile-iso-b.png");

    // Wielder stills + animated spritesheets. Always load shipped
    // defaults; only attempt user override when the probe confirmed it
    // exists (avoids 404 noise).
    for (const role of UNIT_ROLES) {
      this.load.image(TEXTURE_DEFAULT_KEY(role), SPRITE_DEFAULT_URL(role));
      if (hasOverride(role)) {
        this.load.image(TEXTURE_KEY(role), SPRITE_URL(role));
      }
    }
    registerSpritesheetPreload(this);

    // Heartless sheets — 32×32 frames, 8 per sheet.
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
    this.cameras.main.setBackgroundColor("#04060d");

    // Tier 1 filter stack — shared across the whole map
    const cm = this.cameras.main.filters.internal.addColorMatrix();
    cm.colorMatrix.saturate(0.15, true).hue(-6, true).contrast(0.05, true);
    this.bloomFilter = this.cameras.main.filters.internal.addGlow(0xffd86b, 0.45, 0.25, 1, false, 4, 8);
    this.cameras.main.filters.internal.addVignette(0.5, 0.5, 0.85, 0.5);

    // Tier 3 — event-driven filters held at neutral until pulsed.
    // Barrel.amount=1 is identity; pinch (<1) for KO impact distortion.
    // Pixelate.amount=0 is identity; spike briefly for KO screen-thump.
    this.barrelFilter = this.cameras.main.filters.internal.addBarrel(1);
    this.pixelateFilter = this.cameras.main.filters.internal.addPixelate(0);

    // Sky + stars (viewport-locked so they don't pan with the world)
    this.drawSky();
    this.spawnStars(140);

    // Scanline overlay — viewport-locked, depth above worlds
    this.ensureScanlineTexture();
    this.scanline = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, SCANLINE_TEX)
      .setOrigin(0, 0)
      .setDepth(1000)
      .setScrollFactor(0)
      .setAlpha(0.4);

    // Wielder animations — must run after spritesheet preload completes,
    // before any spawnWielder call.
    createRoleAnimations(this.anims, this.textures);

    // Camera control
    this.installCameraControls();

    // Resize handling
    this.scale.on("resize", () => this.handleResize());

    // Event-driven animation switching. Burst protection: same wielder
    // can't trigger an event-anim more than once per MIN_GAP_MS so
    // Cursor's 30-events-per-turn doesn't spiral the tween queue.
    const MIN_GAP_MS = 250;
    const eventHandler = (e: Event) => {
      const ev = (e as CustomEvent<AgentEvent>).detail;
      const now = performance.now();
      // Find the wielder by sessionId (across all worlds).
      let ref: WielderRef | undefined;
      for (const w of this.worlds.values()) {
        const candidate = w.wielders.get(ev.sessionId);
        if (candidate) {
          ref = candidate;
          break;
        }
      }
      if (!ref || !ref.sprite) return;
      if (now - ref.lastEventAnimAt < MIN_GAP_MS) return;
      let animKey: string | undefined;
      if (ev.kind === "tool_use") {
        const toolName = String(ev.payload.name ?? "");
        // Bash / Edit-class tools = "cast" (magic). Read-class = "attack".
        animKey =
          toolName === "Bash" || toolName === "BashOutput"
            ? ANIM.cast(ref.role)
            : ANIM.attack(ref.role);
      } else if (ev.kind === "subagent_spawn") {
        animKey = ANIM.cast(ref.role);
      }
      if (!animKey || !this.anims.exists(animKey)) return;
      ref.lastEventAnimAt = now;
      ref.sprite.play(animKey);
      ref.currentAnim = animKey;
      // Auto-revert to idle after animation likely completes (~600ms).
      const r = ref;
      this.time.delayedCall(700, () => {
        if (!r.sprite || !r.sprite.scene) return;
        const idle = ANIM.idleFront(r.role);
        if (this.anims.exists(idle)) {
          r.sprite.play(idle);
          r.currentAnim = idle;
        }
      });
    };
    window.addEventListener("kh:event", eventHandler as EventListener);

    this.events.once("shutdown", () => {
      window.removeEventListener("kh:event", eventHandler as EventListener);
      this.worlds.clear();
      this.stars = [];
      this.skyGfx = undefined;
      this.scanline = undefined;
      this.lastWorldsKey = "";
      this.lastCameraTargetVersion = 0;
    });
  }

  update(_time: number, delta: number) {
    this.t += delta * 0.001;

    // Sync world planets
    const worlds = useStore.getState().worlds;
    const key = Object.keys(worlds).sort().join(",");
    if (key !== this.lastWorldsKey) {
      this.syncWorlds(worlds);
      this.lastWorldsKey = key;
    }

    // Update per-world live state (count, alert ring color, wielders)
    const units = useStore.getState().units;
    for (const [id, ref] of this.worlds) {
      const w = worlds[id];
      if (!w) continue;
      ref.countText.setText(String(w.unitIds.length));
      ref.countBg.setVisible(w.unitIds.length > 0);
      ref.countText.setVisible(w.unitIds.length > 0);
      if (w.alertLevel !== ref.alertLevel) {
        ref.alertRing.setStrokeStyle(2.5, ALERT_RING_COLOR[w.alertLevel], 1);
        // Tier 3 — golden bloom flare on keyhole seal (any → cleared).
        if (w.alertLevel === "cleared" && ref.alertLevel !== "cleared") {
          this.pulseSeal();
        }
        ref.alertLevel = w.alertLevel;
      }
      if (w.alertLevel === "warning" || w.alertLevel === "danger") {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
        ref.alertRing.setAlpha(0.6 + 0.4 * pulse);
      } else {
        ref.alertRing.setAlpha(1);
      }

      // Sync wielders + heartless for this world.
      this.syncWieldersFor(ref, w, units);
      this.syncHeartlessFor(ref, w);
      // Time-of-day tint per-world based on session age.
      this.updateTimeOfDay(ref);
      // Drift particles inside this world's iso footprint.
      this.tickWorldParticles(ref, delta);
    }

    // Twinkle stars
    for (const s of this.stars) {
      s.twinklePhase += delta * 0.001;
      s.circle.setAlpha(s.baseAlpha * (0.6 + 0.4 * Math.sin(s.twinklePhase)));
    }

    // Cluster labels fade in at zoom-out (zoom < 0.7), out at zoom-in.
    // Per Q40 cascading defaults: cluster labels visible at zoom-out only.
    const z = this.cameras.main.zoom;
    const targetAlpha = z < 0.45 ? 0.95 : z < 0.7 ? (0.7 - z) / 0.25 * 0.95 : 0;
    for (const c of this.clusters.values()) {
      const cur = c.label.alpha;
      // Smooth fade rather than snap
      c.label.setAlpha(cur + (targetAlpha - cur) * 0.15);
    }

    // Camera-target subscription — tween camera when store sets it.
    // Track the monotonic version so re-clicking the same world re-pans.
    const state = useStore.getState();
    if (state.cameraTargetVersion !== this.lastCameraTargetVersion) {
      this.lastCameraTargetVersion = state.cameraTargetVersion;
      const target = state.cameraTarget;
      if (target) {
        const ref = this.worlds.get(target);
        if (ref) {
          this.cameras.main.pan(
            ref.container.x,
            ref.container.y,
            400,
            "Sine.easeInOut"
          );
          // Zoom in if currently far out, so the targeted world's iso
          // plane and (later) wielders are actually legible. Don't
          // override if user is already zoomed in close.
          const cam = this.cameras.main;
          if (cam.zoom < 1.2) {
            cam.zoomTo(1.4, 400, "Sine.easeInOut");
          }
        }
      }
    }
  }

  // ── Tier 3 event pulses ──────────────────────────────────────────
  // Brief impact when a wielder is KO'd: pinch barrel + pixelate spike.
  private pulseKO() {
    const barrel = this.barrelFilter;
    const px = this.pixelateFilter;
    if (!barrel || !px) return;
    this.tweens.killTweensOf(barrel);
    this.tweens.killTweensOf(px);
    this.tweens.add({
      targets: barrel,
      amount: { from: 0.85, to: 1 },
      duration: 480,
      ease: "Cubic.easeOut",
    });
    this.tweens.add({
      targets: px,
      amount: { from: 4, to: 0 },
      duration: 380,
      ease: "Cubic.easeOut",
    });
  }

  // Golden bloom flare when a world's keyhole is sealed.
  private pulseSeal() {
    const bloom = this.bloomFilter;
    if (!bloom) return;
    this.tweens.killTweensOf(bloom);
    this.tweens.add({
      targets: bloom,
      outerStrength: { from: 1.6, to: 0.45 },
      duration: 900,
      ease: "Sine.easeOut",
    });
  }

  private syncWorlds(worlds: Record<string, WorldState>) {
    const seen = new Set(Object.keys(worlds));
    const prevCount = this.worlds.size;

    // Recompute the cluster layout from the full world set. Cheap (O(N))
    // and only fires when the world set actually changed.
    this.layout = computeClusterLayout(worlds);
    this.syncClusterLabels();

    for (const [id, ref] of this.worlds) {
      if (!seen.has(id)) {
        ref.container.destroy(true);
        this.worlds.delete(id);
      } else {
        // Existing world might have moved when the cluster set changed
        // (e.g., a sibling repo was added). Reposition smoothly.
        const pos = this.layout.get(id);
        if (pos && (ref.container.x !== pos.x || ref.container.y !== pos.y)) {
          this.tweens.add({
            targets: ref.container,
            x: pos.x,
            y: pos.y,
            duration: 600,
            ease: "Sine.easeInOut",
          });
        }
      }
    }
    for (const id of seen) {
      if (this.worlds.has(id)) continue;
      this.worlds.set(id, this.spawnWorld(id, worlds[id]));
    }
    // Auto-fit camera when the world set changes, unless the user has
    // touched the camera recently (manual control wins).
    const shouldAutoFit =
      this.worlds.size !== prevCount &&
      this.worlds.size > 0 &&
      performance.now() - this.lastUserCamMs > 4000;
    if (shouldAutoFit) this.fitCameraToWorlds();
  }

  /**
   * Maintain a label sprite per cluster, positioned at the cluster's
   * centroid. Labels visible only at zoom-out (zoom < 0.7) per Q40
   * cascading defaults.
   */
  private syncClusterLabels() {
    const clusterKeys = new Set<string>();
    for (const layout of this.layout.values()) clusterKeys.add(layout.clusterKey);

    // Drop labels for clusters that are gone.
    for (const [key, ref] of this.clusters) {
      if (!clusterKeys.has(key)) {
        ref.label.destroy();
        this.clusters.delete(key);
      }
    }

    // Compute centroid per cluster + create / move labels.
    for (const key of clusterKeys) {
      const members = [...this.layout.entries()].filter(
        ([, l]) => l.clusterKey === key
      );
      let cx = 0, cy = 0;
      for (const [, l] of members) {
        cx += l.x;
        cy += l.y;
      }
      cx /= members.length;
      cy /= members.length;
      const display = clusterDisplayName(key);
      let ref = this.clusters.get(key);
      if (!ref) {
        const label = this.add
          .text(cx, cy - 140, display.toUpperCase(), {
            fontSize: "16px",
            color: "#ffd86b",
            fontFamily: "ui-monospace, monospace",
            fontStyle: "bold",
            letterSpacing: 2,
          })
          .setOrigin(0.5)
          .setAlpha(0)
          .setDepth(-10);
        ref = { key, centroid: { x: cx, y: cy }, label };
        this.clusters.set(key, ref);
      } else {
        ref.centroid = { x: cx, y: cy };
        ref.label.setPosition(cx, cy - 140);
        ref.label.setText(display.toUpperCase());
      }
    }
  }

  /**
   * Pan + zoom the camera to show all current worlds with padding.
   * Used on first-spawn and on a future "recenter" verb.
   */
  private fitCameraToWorlds() {
    if (this.worlds.size === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const ref of this.worlds.values()) {
      minX = Math.min(minX, ref.container.x);
      minY = Math.min(minY, ref.container.y);
      maxX = Math.max(maxX, ref.container.x);
      maxY = Math.max(maxY, ref.container.y);
    }
    const padding = 160;
    const w = (maxX - minX) + padding * 2;
    const h = (maxY - minY) + padding * 2;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const cam = this.cameras.main;
    const targetZoom = Math.min(
      cam.width / Math.max(w, 200),
      cam.height / Math.max(h, 200)
    );
    cam.zoom = Phaser.Math.Clamp(targetZoom, 0.3, 1.5);
    cam.centerOn(cx, cy);
  }

  private spawnWorld(worldId: string, world: WorldState): WorldRef {
    const theme = themeFor(worldId);
    const pos = this.layout.get(worldId) ?? { x: 0, y: 0 };
    const container = this.add.container(pos.x, pos.y);

    // Iso plane container — scaled down to fit cluster spacing. Holds
    // tiles + landmark + (later) wielder sprites + heartless. Anchored
    // so the visual center sits at the world container's origin.
    const isoPlane = this.add.container(0, 0);
    isoPlane.setScale(ISO_CONTAINER_SCALE);
    this.buildIsoPlane(isoPlane, theme);

    // UI affordances at native scale (don't shrink with the iso plane).
    const ringRadius = (ISO_GRID * ISO_TILE_W * ISO_CONTAINER_SCALE) / 2 + 8;
    const alertRing = this.add
      .circle(0, 0, ringRadius, 0x000000, 0)
      .setStrokeStyle(2.5, ALERT_RING_COLOR[world.alertLevel], 1);

    const labelY = ringRadius + 6;
    const label = this.add
      .text(0, labelY, world.label, {
        fontSize: "13px",
        color: "#cfd9f0",
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    const themeText = this.add
      .text(0, labelY + 18, themeLabel(theme).toUpperCase(), {
        fontSize: "9px",
        color: "#8aa0d0",
        fontFamily: "ui-monospace, monospace",
        letterSpacing: 1,
      })
      .setOrigin(0.5, 0);

    const badgeX = ringRadius - 4;
    const badgeY = -ringRadius + 4;
    const countBg = this.add
      .rectangle(badgeX, badgeY, 22, 16, 0x1a2244, 0.95)
      .setStrokeStyle(1, 0xffd86b, 0.6)
      .setVisible(world.unitIds.length > 0);
    const countText = this.add
      .text(badgeX, badgeY, String(world.unitIds.length), {
        fontSize: "11px",
        color: "#ffd86b",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setVisible(world.unitIds.length > 0);

    // Time-of-day overlay — sized to cover the iso plane footprint.
    // Tinted by session age in update(); starts transparent.
    const todSize = ISO_GRID * ISO_TILE_W * ISO_CONTAINER_SCALE * 1.1;
    const todOverlay = this.add
      .rectangle(0, 0, todSize, todSize, 0x000000, 0)
      .setOrigin(0.5);

    container.add([isoPlane, todOverlay, alertRing, label, themeText, countBg, countText]);

    // Click → select world's first wielder + pan camera here.
    // Hit area is the alert ring (covers the world's footprint).
    alertRing.setInteractive({ useHandCursor: true });
    alertRing.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.button !== 0 || this.didDrag) return;
      const w = useStore.getState().worlds[worldId];
      const firstUnit = w?.unitIds?.[0];
      if (firstUnit) useStore.getState().selectUnit(firstUnit);
      useStore.getState().setCameraTarget(worldId);
    });

    return {
      worldId,
      container,
      isoPlane,
      todOverlay,
      alertRing,
      countText,
      countBg,
      theme,
      alertLevel: world.alertLevel,
      spawnedAt: this.time.now,
      wielders: new Map(),
      heartless: new Map(),
      particles: this.spawnWorldParticles(isoPlane, theme),
    };
  }

  /**
   * Tick per-world particles — drift + alpha twinkle + wrap inside
   * iso footprint. delta is in ms.
   */
  private tickWorldParticles(worldRef: WorldRef, delta: number) {
    const dt = delta / 1000;
    const halfW = (ISO_GRID * ISO_TILE_W) / 2 + 40;
    const topY = -(ISO_GRID * ISO_TILE_H) / 2 - 20;
    const bottomY = (ISO_GRID * ISO_TILE_H) / 2 + 20;
    for (const p of worldRef.particles) {
      p.circle.x += p.vx * dt;
      p.circle.y += p.vy * dt;
      // Wrap horizontally
      if (p.circle.x > halfW) p.circle.x = -halfW;
      if (p.circle.x < -halfW) p.circle.x = halfW;
      // Wrap vertically (most particles drift up; respawn at bottom)
      if (p.circle.y < topY) p.circle.y = bottomY;
      if (p.circle.y > bottomY) p.circle.y = topY;
      // Subtle twinkle
      p.phase += dt * 1.5;
      p.circle.setAlpha(p.baseAlpha * (0.55 + 0.45 * Math.sin(p.phase)));
    }
  }

  /**
   * Per-theme drifting particles inside the world's iso footprint.
   * Each particle is a small Phaser Arc with random velocity; ticked
   * in update(). Wraps around the iso bounding box.
   */
  private spawnWorldParticles(
    plane: Phaser.GameObjects.Container,
    theme: WorldTheme
  ): WorldRef["particles"] {
    const cfg = THEME_PARTICLES[theme];
    const halfW = (ISO_GRID * ISO_TILE_W) / 2;
    const halfH = (ISO_GRID * ISO_TILE_H);
    const out: WorldRef["particles"] = [];
    for (let i = 0; i < cfg.count; i++) {
      const x = (Math.random() - 0.5) * halfW * 2;
      const y = (Math.random() - 0.5) * halfH;
      const baseAlpha = 0.35 + Math.random() * 0.5;
      const c = this.add
        .circle(x, y, cfg.size + Math.random() * 0.6, cfg.color, baseAlpha)
        .setDepth(-15);
      plane.add(c);
      out.push({
        circle: c,
        vx: (Math.random() - 0.5) * cfg.speed * 60,
        vy: (Math.random() - 0.5) * cfg.speed * 60 - cfg.speed * 30, // bias upward
        baseAlpha,
        phase: Math.random() * Math.PI * 2,
      });
    }
    return out;
  }

  /**
   * Add/remove wielder sprites for a world based on its current unitIds.
   * Wielders live inside the world's isoPlane container so they share its
   * scaling.
   */
  private syncWieldersFor(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>
  ) {
    const seen = new Set(world.unitIds);
    // Remove gone
    for (const [id, w] of worldRef.wielders) {
      if (!seen.has(id)) {
        w.tether?.destroy();
        w.container.destroy(true);
        worldRef.wielders.delete(id);
      }
    }
    // Add new
    let index = worldRef.wielders.size;
    for (const id of world.unitIds) {
      if (worldRef.wielders.has(id)) continue;
      const unit = units[id];
      if (!unit) continue;
      worldRef.wielders.set(id, this.spawnWielder(worldRef, unit, index));
      index++;
    }
    // Per-frame state update for everyone (HP/MP/aura/patrol/status/tether)
    for (const [id, ref] of worldRef.wielders) {
      const unit = units[id];
      if (!unit) continue;
      this.updateWielder(worldRef, ref, unit);
    }
  }

  /**
   * Per-frame visual update for a wielder. Handles:
   * - HP/MP ring fill
   * - Drive-form aura visibility + activation flash
   * - Status pose (death tilt, victory pulse)
   * - Patrol step (walk toward target tile, idle, pick new)
   * - Subagent tether to parent
   */
  private updateWielder(
    worldRef: WorldRef,
    ref: WielderRef,
    unit: UnitState
  ) {
    const now = this.time.now;

    // ── HP / MP rings ────────────────────────────────────────────────
    // Arc end-angle = -90 + (270 * fraction). Setting endAngle redraws.
    const hpFrac = Math.max(0, Math.min(1, unit.hp / 100));
    const mpFrac = Math.max(0, Math.min(1, unit.mp / 100));
    ref.hpRing.endAngle = -90 + 270 * hpFrac;
    ref.mpRing.endAngle = -90 + 270 * mpFrac;
    // Critical HP — pulse the HP ring red.
    if (unit.hp > 0 && unit.hp < 25) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
      ref.hpRing.setStrokeStyle(2, 0xff5a3c, 0.6 + 0.4 * pulse);
    } else {
      ref.hpRing.setStrokeStyle(2, 0xff6b8a, 0.85);
    }

    // ── Drive aura ──────────────────────────────────────────────────
    if (unit.driveForm !== ref.lastDriveForm) {
      if (unit.driveForm) {
        const color = DRIVE_COLORS[unit.driveForm];
        ref.driveAura
          .setVisible(true)
          .setStrokeStyle(3, color, 1)
          .setScale(0.4);
        // Activation flash: scale up + fade in.
        this.tweens.add({
          targets: ref.driveAura,
          scale: 1,
          duration: 280,
          ease: "Back.easeOut",
        });
        // Persistent glow pulse while active.
        this.tweens.add({
          targets: ref.driveAura,
          alpha: { from: 0.95, to: 0.45 },
          yoyo: true,
          repeat: -1,
          duration: 800,
        });
      } else {
        // Drive ended — fade aura out.
        this.tweens.killTweensOf(ref.driveAura);
        this.tweens.add({
          targets: ref.driveAura,
          alpha: 0,
          duration: 220,
          onComplete: () => ref.driveAura.setVisible(false),
        });
      }
      ref.lastDriveForm = unit.driveForm;
    }

    // ── Status pose (death / victory) ───────────────────────────────
    if (unit.status !== ref.lastStatus) {
      if (unit.status === "fallen") {
        // Tilt + fade slightly. Stop patrol.
        this.tweens.killTweensOf(ref.container);
        this.tweens.add({
          targets: ref.container,
          angle: 80,
          alpha: 0.55,
          duration: 420,
          ease: "Sine.easeIn",
        });
        // Tint sprite dark.
        ref.sprite?.setTint(0x553355);
        // Tier 3 — screen impact.
        this.pulseKO();
      } else if (unit.status === "complete") {
        // Victory pulse — small scale up/down + label tints gold.
        this.tweens.add({
          targets: ref.container,
          scale: { from: 1, to: 1.15 },
          yoyo: true,
          duration: 240,
          ease: "Sine.easeInOut",
        });
        ref.label.setColor("#ffd86b");
      } else if (
        ref.lastStatus === "fallen" ||
        ref.lastStatus === "complete"
      ) {
        // Recovered (rare — typically fixtures only).
        this.tweens.killTweensOf(ref.container);
        ref.container.setAngle(0);
        ref.container.setAlpha(1);
        ref.sprite?.clearTint();
        ref.label.setColor("#e6ecff");
      }
      ref.lastStatus = unit.status;
    }

    // ── Patrol behavior ─────────────────────────────────────────────
    // Stop patrolling if not in a "free" status. Idle wielders patrol;
    // working/casting/fallen/complete don't.
    const canPatrol = unit.status === "idle" || unit.status === "moving";
    if (canPatrol && now >= ref.patrolNextSwitchAt) {
      // Pick a new target tile within the iso grid.
      const tx = 1 + Math.floor(Math.random() * (ISO_GRID - 1));
      const ty = 1 + Math.floor(Math.random() * (ISO_GRID - 1));
      const offsetY = -(ISO_GRID * ISO_TILE_H) / 2;
      const targetX = (tx - ty) * (ISO_TILE_W / 2);
      const targetY = offsetY + (tx + ty) * (ISO_TILE_H / 2);
      ref.patrolTarget = { tx, ty };
      ref.patrolState = "walking";
      this.tweens.killTweensOf(ref.container);
      // Ensure no stale rotation/alpha from a fallen→recovered transition
      ref.container.setAngle(0);
      ref.container.setAlpha(1);
      const dist = Math.hypot(targetX - ref.container.x, targetY - ref.container.y);
      const duration = Math.max(800, dist * 12);
      // Switch to walk animation while moving.
      const walkAnim = ANIM.walkDown(unit.role);
      if (this.anims.exists(walkAnim) && ref.sprite && ref.currentAnim !== walkAnim) {
        ref.sprite.play(walkAnim);
        ref.currentAnim = walkAnim;
      }
      this.tweens.add({
        targets: ref.container,
        x: targetX,
        y: targetY,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => {
          ref.patrolState = "arrived";
          ref.patrolNextSwitchAt = now + 1200 + Math.random() * 2400;
          // Return to idle anim.
          const idle = getIdleAnimKey(unit.role);
          if (this.anims.exists(idle) && ref.sprite) {
            ref.sprite.play(idle);
            ref.currentAnim = idle;
          }
        },
      });
    }

    // ── Subagent tether ─────────────────────────────────────────────
    if (unit.parentSessionId && unit.parentSessionId !== ref.parentSessionId) {
      ref.parentSessionId = unit.parentSessionId;
    }
    if (ref.parentSessionId) {
      const parent = worldRef.wielders.get(ref.parentSessionId);
      if (parent) {
        if (!ref.tether) {
          ref.tether = this.add.graphics().setDepth(-5);
          worldRef.isoPlane.add(ref.tether);
        }
        ref.tether.clear();
        ref.tether.lineStyle(1.5, 0xffd86b, 0.65);
        ref.tether.beginPath();
        ref.tether.moveTo(parent.container.x, parent.container.y);
        ref.tether.lineTo(ref.container.x, ref.container.y);
        ref.tether.strokePath();
      } else if (ref.tether) {
        ref.tether.destroy();
        ref.tether = undefined;
      }
    } else if (ref.tether) {
      ref.tether.destroy();
      ref.tether = undefined;
    }

    // ── Composite-form banner ───────────────────────────────────────
    // If this wielder has subagents alive in the same world, show a
    // gold composite-form banner above its head.
    let childCount = 0;
    for (const other of worldRef.wielders.values()) {
      if (other === ref) continue;
      if (other.parentSessionId === ref.unitId) childCount++;
    }
    if (childCount > 0) {
      const formName =
        childCount === 1 ? "✦ Pair"
        : childCount === 2 ? "✦ Royal Guard"
        : "✦ Wayfinder Trio";
      if (!ref.compositeBanner) {
        ref.compositeBanner = this.add
          .text(0, -52, formName, {
            fontSize: "9.5px",
            color: "#ffd86b",
            fontFamily: "ui-monospace, monospace",
            fontStyle: "bold",
            backgroundColor: "rgba(20, 16, 64, 0.85)",
            padding: { x: 5, y: 2 },
          })
          .setOrigin(0.5);
        ref.container.add(ref.compositeBanner);
      } else if (ref.compositeBanner.text !== formName) {
        ref.compositeBanner.setText(formName);
      }
    } else if (ref.compositeBanner) {
      ref.compositeBanner.destroy();
      ref.compositeBanner = undefined;
    }
  }

  /**
   * Build a wielder sprite container at the world's home tile for this
   * unit's index. Uses the per-world iso coordinates so positions are
   * relative to the iso plane container's origin (which is itself
   * scaled by ISO_CONTAINER_SCALE inside the world container).
   */
  private spawnWielder(
    worldRef: WorldRef,
    unit: UnitState,
    index: number
  ): WielderRef {
    const palette = ROLE_PALETTE[unit.role];

    // Home tile: spread wielders around the inner perimeter of the iso
    // grid so they don't all stand on the central landmark. Ring layout
    // mirrors the original WorldScene logic but at the smaller grid.
    const ringSlots = 6;
    const slot = index % ringSlots;
    const homeTx = 1 + (slot % 3);
    const homeTy = ISO_GRID - 1 - Math.floor(slot / 3);
    const offsetY = -(ISO_GRID * ISO_TILE_H) / 2;
    const x = (homeTx - homeTy) * (ISO_TILE_W / 2);
    const y = offsetY + (homeTx + homeTy) * (ISO_TILE_H / 2);

    const glow = this.add.circle(0, 6, 16, palette.color, 0.28);

    // Drive aura — a colored ring that fades in when a drive form
    // activates and pulses while active. Hidden by default.
    const driveAura = this.add
      .circle(0, 4, 30, 0xffffff, 0)
      .setStrokeStyle(2.5, 0xffffff, 0)
      .setVisible(false);

    // HP / MP rings — arc shapes at the wielder's feet (so they don't
    // occlude the painterly face). HP outer (red), MP inner (blue).
    // Drawn as 270° arcs starting from -90° (top) for "fill clockwise".
    const hpRing = this.add
      .arc(0, 14, 22, -90, 270 * (unit.hp / 100) - 90, false, 0xff6b8a, 0)
      .setStrokeStyle(2, 0xff6b8a, 0.85);
    const mpRing = this.add
      .arc(0, 14, 26, -90, 270 * (unit.mp / 100) - 90, false, 0x6cc6ff, 0)
      .setStrokeStyle(2, 0x6cc6ff, 0.6);

    const body = this.add.container(0, 0);
    const sprite = this.populateWielderBody(body, unit.role);

    const label = this.add
      .text(0, -32, unit.displayName, {
        fontSize: "9px",
        color: "#e6ecff",
        backgroundColor: "rgba(0,0,0,0.55)",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5);

    // Layer order matters: drive aura behind, body in middle, rings
    // on top so they read against the painterly hi-res sprite.
    const container = this.add.container(x, y, [
      driveAura,
      glow,
      body,
      hpRing,
      mpRing,
      label,
    ]);
    container.setData("unitId", unit.id);

    // Ambient breathing glow pulse
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.18, to: 0.42 },
      yoyo: true,
      repeat: -1,
      duration: 1200 + Math.random() * 400,
    });

    worldRef.isoPlane.add(container);

    return {
      unitId: unit.id,
      role: unit.role,
      container,
      body,
      sprite,
      glow,
      driveAura,
      hpRing,
      mpRing,
      label,
      homeTx,
      homeTy,
      patrolState: "scouting",
      patrolNextSwitchAt: this.time.now + 600 + Math.random() * 1800,
      lastStatus: unit.status,
      lastDriveForm: unit.driveForm,
      lastEventAnimAt: 0,
      currentAnim: undefined,
      parentSessionId: unit.parentSessionId,
    };
  }

  /**
   * Add/remove heartless mob sprites for a world based on its current
   * heartless array. Heartless live inside the world's isoPlane container
   * so they share its scaling.
   */
  private syncHeartlessFor(worldRef: WorldRef, world: WorldState) {
    const seen = new Set<string>();
    for (const h of world.heartless) {
      seen.add(h.id);
      if (worldRef.heartless.has(h.id)) continue;
      worldRef.heartless.set(h.id, this.spawnHeartlessIn(worldRef, h));
    }
    for (const [id, ref] of worldRef.heartless) {
      if (!seen.has(id)) {
        this.poofHeartless(ref);
        worldRef.heartless.delete(id);
      }
    }
  }

  private spawnHeartlessIn(worldRef: WorldRef, h: Heartless): HeartlessRef {
    // Spawn at a random edge tile (so they crawl in from the dark border).
    const edge = Math.floor(Math.random() * 4);
    let tx = 0, ty = 0;
    switch (edge) {
      case 0: tx = Math.random() * ISO_GRID; ty = -1; break;
      case 1: tx = ISO_GRID; ty = Math.random() * ISO_GRID; break;
      case 2: tx = Math.random() * ISO_GRID; ty = ISO_GRID; break;
      case 3: tx = -1; ty = Math.random() * ISO_GRID; break;
    }
    const offsetY = -(ISO_GRID * ISO_TILE_H) / 2;
    const x = (tx - ty) * (ISO_TILE_W / 2);
    const y = offsetY + (tx + ty) * (ISO_TILE_H / 2);

    const shadow = this.add.ellipse(0, 14, 16, 4, 0x000000, 0.55);
    const body = this.add.container(0, 0);
    const sheetKey = `heartless-${h.type.replace(/_/g, "")}-sheet`;
    if (this.textures.exists(sheetKey)) {
      const spr = this.add.sprite(0, 0, sheetKey, 0);
      spr.setScale(1.4);
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
      body.add(drawShadow(this));
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
    worldRef.isoPlane.add(container);
    return {
      id: h.id,
      type: h.type,
      targetUnitId: h.targetUnitId,
      container,
      body,
      shadow,
      bobOffset: Math.random() * Math.PI * 2,
      lastLungeAt: 0,
    };
  }

  private poofHeartless(ref: HeartlessRef) {
    if (!ref.container.scene) return;
    this.tweens.add({
      targets: ref.container,
      scale: 0.2,
      alpha: 0,
      duration: 240,
      onComplete: () => ref.container.destroy(true),
    });
  }

  /**
   * Tint each world's overlay based on session age — bright daylight at
   * start, sunset orange after 10min, dusk after 20min. Per Q14 in
   * vision.md (locked v1 cycle), but applied per-world here so each
   * world has its own clock.
   */
  private updateTimeOfDay(worldRef: WorldRef) {
    const ageMs = this.time.now - worldRef.spawnedAt;
    const m = ageMs / 60_000;
    let color = 0x000000;
    let alpha = 0;
    if (m < 3) {
      color = 0x6cc6ff;
      alpha = 0.05;
    } else if (m < 10) {
      color = 0xffb86c;
      alpha = 0.08;
    } else if (m < 20) {
      color = 0xff7a4a;
      alpha = 0.16;
    } else {
      color = 0x1a1340;
      alpha = 0.28;
    }
    worldRef.todOverlay.setFillStyle(color, alpha);
  }

  /**
   * Add the wielder's visual into the body container. Order:
   * sheet (animated) → still image → drawn fallback.
   * Sized for the per-world iso scale; bottom-center anchored so the
   * sprite's feet land on the container origin.
   */
  private populateWielderBody(
    body: Phaser.GameObjects.Container,
    role: keyof typeof ROLE_PALETTE
  ): Phaser.GameObjects.Sprite | undefined {
    const sheet = getSpritesheetConfig(role, this.textures);
    if (sheet) {
      const spr = this.add.sprite(0, 0, sheet.textureKey, 0);
      // ~290×200 source; scale 0.55 brings it to ~160×110, which inside
      // the 0.55-scaled isoPlane shows ~88×60 on canvas at 1× zoom —
      // legible at zoom 1.4 (the click-target zoom).
      spr.setScale(0.55);
      spr.setOrigin(0.5, 1);
      spr.y = 8;
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
      img.setScale(0.55);
      img.setOrigin(0.5, 1);
      img.y = 8;
      body.add(img);
    }
    // No drawn-primitive fallback in Kingdom for now (deprecated path).
    return undefined;
  }

  /**
   * Build a small iso plane (ISO_GRID × ISO_GRID tiles) into the given
   * container, centered on the container origin, with the theme's
   * landmark sprite at center + small accent landmarks at fixed offsets.
   * Falls back to drawn polygons if the tile texture didn't load.
   */
  private buildIsoPlane(plane: Phaser.GameObjects.Container, theme: WorldTheme) {
    const haveTiles = this.textures.exists("tile-iso-a") && this.textures.exists("tile-iso-b");
    const offsetY = -(ISO_GRID * ISO_TILE_H) / 2;
    const isoToLocal = (tx: number, ty: number) => ({
      x: (tx - ty) * (ISO_TILE_W / 2),
      y: offsetY + (tx + ty) * (ISO_TILE_H / 2),
    });

    if (haveTiles) {
      for (let x = 0; x < ISO_GRID; x++) {
        for (let y = 0; y < ISO_GRID; y++) {
          const c = isoToLocal(x + 0.5, y + 0.5);
          const tex = (x + y) % 2 === 0 ? "tile-iso-a" : "tile-iso-b";
          const tile = this.add.image(c.x, c.y, tex);
          tile.setOrigin(0.5, 0.5);
          plane.add(tile);
        }
      }
    } else {
      // Fallback: drawn iso diamonds (tile textures missing).
      const g = this.add.graphics();
      g.lineStyle(1, 0x1d2851, 0.6);
      for (let x = 0; x < ISO_GRID; x++) {
        for (let y = 0; y < ISO_GRID; y++) {
          const a = isoToLocal(x, y);
          const b = isoToLocal(x + 1, y);
          const c = isoToLocal(x + 1, y + 1);
          const d = isoToLocal(x, y + 1);
          g.fillStyle((x + y) % 2 === 0 ? 0x0a1130 : 0x0d1638, 1);
          g.fillPoints([a, b, c, d] as Phaser.Math.Vector2[], true);
          g.strokePoints([a, b, c, d, a] as Phaser.Math.Vector2[]);
        }
      }
      plane.add(g);
    }

    // Center landmark (themed). Anchored bottom-center so the building
    // sits on the central tile; lifted slightly so it doesn't intersect
    // the tile floor.
    const center = isoToLocal(ISO_GRID / 2, ISO_GRID / 2);
    const tex = LANDMARK_TEX(theme);
    if (this.textures.exists(tex)) {
      const lm = this.add.image(center.x, center.y - 4, tex);
      lm.setOrigin(0.5, 1);
      lm.setScale(1.4);
      plane.add(lm);

      // Small accent decorations scattered around.
      for (const a of THEME_ACCENTS[theme]) {
        const p = isoToLocal(a.tx + 0.5, a.ty + 0.5);
        const acc = this.add.image(p.x, p.y - 2, tex);
        acc.setOrigin(0.5, 1);
        acc.setScale(a.scale);
        acc.setAlpha(a.alpha);
        plane.add(acc);
      }
    }
  }

  private installCameraControls() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      this.dragOriginScroll = {
        x: this.cameras.main.scrollX,
        y: this.cameras.main.scrollY,
      };
      this.dragOriginPointer = { x: p.x, y: p.y };
      this.didDrag = false;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.dragOriginScroll || !this.dragOriginPointer) return;
      const dx = p.x - this.dragOriginPointer.x;
      const dy = p.y - this.dragOriginPointer.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.didDrag = true;
        this.lastUserCamMs = performance.now();
      }
      this.cameras.main.setScroll(
        this.dragOriginScroll.x - dx / this.cameras.main.zoom,
        this.dragOriginScroll.y - dy / this.cameras.main.zoom
      );
    });
    this.input.on("pointerup", () => {
      this.dragOriginScroll = null;
      this.dragOriginPointer = null;
    });
    this.input.on(
      "wheel",
      (
        _p: Phaser.Input.Pointer,
        _g: unknown,
        _dx: number,
        dy: number
      ) => {
        const cam = this.cameras.main;
        const factor = dy > 0 ? 1 / 1.1 : 1.1;
        cam.zoom = Phaser.Math.Clamp(cam.zoom * factor, 0.3, 2.5);
        this.lastUserCamMs = performance.now();
      }
    );
  }

  private drawSky() {
    this.skyGfx = this.add
      .graphics()
      .setDepth(-100)
      .setScrollFactor(0);
    this.repaintSky();
  }

  private repaintSky() {
    if (!this.skyGfx) return;
    this.skyGfx.clear();
    this.skyGfx.fillGradientStyle(0x0a0518, 0x0a0518, 0x1a0a30, 0x0a0518, 1);
    this.skyGfx.fillRect(0, 0, this.scale.width, this.scale.height);
  }

  private spawnStars(n: number) {
    for (let i = 0; i < n; i++) {
      const x = Math.random() * this.scale.width;
      const y = Math.random() * this.scale.height;
      const r = 0.6 + Math.random() * 1.4;
      const baseAlpha = 0.3 + Math.random() * 0.7;
      const c = this.add
        .circle(x, y, r, 0xffffff, baseAlpha)
        .setDepth(-80)
        .setScrollFactor(0);
      this.stars.push({
        circle: c,
        twinklePhase: Math.random() * Math.PI * 2,
        baseAlpha,
      });
    }
  }

  private ensureScanlineTexture() {
    if (this.textures.exists(SCANLINE_TEX)) return;
    const g = this.add.graphics({ x: 0, y: 0 });
    g.fillStyle(0x000000, 0.18);
    g.fillRect(0, 0, 4, 1);
    g.fillStyle(0x000000, 0.06);
    g.fillRect(0, 1, 4, 1);
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 2, 4, 2);
    g.generateTexture(SCANLINE_TEX, 4, 4);
    g.destroy();
  }

  private handleResize() {
    this.repaintSky();
    if (this.scanline) {
      this.scanline.setSize(this.scale.width, this.scale.height);
    }
  }
}

/**
 * Constellation clustering layout (Q40.3).
 *
 * Group worlds by their repo's parent directory on disk (e.g.,
 * `~/work/foo` and `~/work/bar` cluster together). Each cluster's centroid
 * is positioned by hash on a large outer ring; member worlds sit on a
 * smaller inner ring around that centroid.
 *
 * Hash-only fallback for ungrouped repos (cluster size 1) — they live on
 * the outer ring at their hash position, no inner ring offset.
 */
function computeClusterLayout(
  worldsRecord: Record<string, WorldState>
): Map<string, { x: number; y: number; clusterKey: string }> {
  const out = new Map<string, { x: number; y: number; clusterKey: string }>();
  const worlds = Object.values(worldsRecord);
  if (worlds.length === 0) return out;

  // Group by parent dir of world.path
  const clusters = new Map<string, WorldState[]>();
  for (const w of worlds) {
    const key = clusterKeyFor(w.path);
    let list = clusters.get(key);
    if (!list) {
      list = [];
      clusters.set(key, list);
    }
    list.push(w);
  }

  // Walk clusters in deterministic order (sorted key) so positions stay
  // stable across rebuilds.
  const sortedKeys = [...clusters.keys()].sort();

  for (const key of sortedKeys) {
    const members = clusters.get(key)!.slice().sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    const ch = hashString(key);
    // Outer ring: cluster centroids at radius 600–1400 from origin.
    const outerRadius = 600 + (Math.abs(ch) % 800);
    const outerAngle = ((Math.abs(ch >> 8) % 360) * Math.PI) / 180;
    const cx = Math.cos(outerAngle) * outerRadius;
    const cy = Math.sin(outerAngle) * outerRadius;

    if (members.length === 1) {
      out.set(members[0].id, { x: cx, y: cy, clusterKey: key });
      continue;
    }

    // Inner ring: members spaced around the cluster centroid. Sized so
    // a per-world iso plane (~230px) plus alert ring fits without
    // overlapping its neighbor.
    const innerRadius = 200 + members.length * 28;
    members.forEach((w, i) => {
      const angle = (i / members.length) * Math.PI * 2 - Math.PI / 2;
      out.set(w.id, {
        x: cx + Math.cos(angle) * innerRadius,
        y: cy + Math.sin(angle) * innerRadius,
        clusterKey: key,
      });
    });
  }

  return out;
}

/**
 * Cluster key = parent directory of the repo path. Any repo with at least
 * 2 path segments clusters with its siblings (so `/tmp/foo` and
 * `/tmp/bar` both cluster under `/tmp`). Single-segment paths like `/repo`
 * are their own cluster.
 */
function clusterKeyFor(repoPath: string): string {
  const parts = repoPath.split("/").filter(Boolean);
  if (parts.length < 2) return repoPath;
  return "/" + parts.slice(0, -1).join("/");
}

/**
 * Friendly cluster label. Trims the path to the last 2 segments so e.g.
 * `/Users/ed/Github/emoralesb05` shows as "Github / emoralesb05".
 */
function clusterDisplayName(clusterKey: string): string {
  const parts = clusterKey.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (parts.length === 1) return parts[0];
  return parts.slice(-2).join(" / ");
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}
