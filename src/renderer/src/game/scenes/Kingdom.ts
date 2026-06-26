/**
 * KingdomScene — the unified Star Chart.
 *
 * Replaces the old 3-scene drill-down (Throne / Realm / Arena) with a single
 * pan/zoom canvas where a central base, every world, and active agents are
 * visible simultaneously. Camera controls: drag-pan with mouse, scroll-wheel
 * zoom. Click a world to select its first wielder + pan camera to it.
 *
 * Q40 architecture (vision.md):
 * - Q40.1 Throne fate: side overlay panel (React) — handled outside this scene.
 * - Q40.2 Camera: strict manual + click-card-to-pan.
 * - Q40.3 Layout: constellation clustering (hash placeholder for spike).
 * - Q40.4 Zoom-out rendering: single rendering scaled by camera (no LoD steps).
 *
 * Spike scope: planet rendering + atmosphere + camera control. Iso-plane
 * rendering + wielder sprites + riftling will be ported from World.ts in
 * subsequent iterations (tasks #14, #15, #16).
 */

import * as Phaser from "phaser";
import { unitIdentityForUnit, useStore } from "../../store";
import type {
  AgentEvent,
  Letter,
  UnitState,
  WielderStats,
  WorldState,
  WorldAlertLevel,
  WardenAura,
} from "@shared/events";
import { themeFor, themeLabel, type WorldTheme } from "../realm-worlds";
import {
  clusterDisplayName,
  computeClusterLayout,
  hashString,
} from "../cluster-layout";
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
import { drawShadow, type RiftlingRef } from "../riftling";
import { pickBarkLine, type BarkKind } from "../wielder-barks";
import {
  activityColorForTheme,
  activityForEvent,
  activityForToolName,
  activityLabel,
  type WorldActivityKind,
} from "../world-aliveness";
import { drawActivityGlyph } from "../world-aliveness-vfx";
import {
  projectViewportToTacticalMap,
  projectWorldToTacticalMap,
  tacticalCameraWorldView as createTacticalCameraWorldView,
  unprojectTacticalMapToWorld,
  type TacticalBounds,
  type TacticalMapLayout,
  type TacticalPoint,
  type TacticalRect,
} from "../tactical-map";
import type { Riftling } from "@shared/events";

// Aura-state colors — match the RW visual language.
const AURA_COLORS: Record<WardenAura, number> = {
  guard: 0xff5a3c,
  focus: 0x6cc6ff,
  link: 0xffd86b,
};

const SCANLINE_TEX = "rw-realm-scanlines";

// Per-world iso plane geometry. Smaller than the legacy WorldScene grid
// (was 12×12 with TILE_W=96/TILE_H=48); shrunk to fit cluster spacing.
const ISO_TILE_W = 64;
const ISO_TILE_H = 32;
const ISO_GRID = 6;
// Container scale to fit a per-world iso plane in roughly a 230×230 box,
// matching the cluster inner-ring spacing. Worlds are positioned by the
// cluster layout; this scale just makes their internal renderings fit.
const ISO_CONTAINER_SCALE = 0.62;

// Central base geometry. Agents idle here between missions; worlds are treated
// as destination nodes around the base instead of tiny maps that hold the full
// party sprite population.
const BASE_TILE_W = 72;
const BASE_TILE_H = 36;
const BASE_GRID_W = 10;
const BASE_GRID_H = 8;
const BASE_RADIUS = 260;
const WIELDER_SPRITE_SCALE = 0.34;
const WORLD_FOCUS_ZOOM = 1.16;
const MISSION_DWELL_MS = 3500;
const PERMISSION_DWELL_MS = 6500;
const MISSION_PAD_COUNT = 6;
const WORLD_REALM_PAD_X = 240;
const WORLD_REALM_PAD_Y = 175;
const ABSOLUTE_MIN_ZOOM = 0.18;
const STRATEGY_ZOOM_EXTRA_ROOM = 0.92;
const CAMERA_SAFE_LEFT_PX = 330;
const CAMERA_SAFE_RIGHT_PX = 330;
const CAMERA_SAFE_TOP_PX = 110;
const CAMERA_SAFE_BOTTOM_PX = 270;
const CAMERA_WORLD_PAD_X = 140;
const CAMERA_WORLD_PAD_Y = 120;
const TACTICAL_MAP_MIN_W = 176;
const TACTICAL_MAP_MAX_W = 236;
const TACTICAL_MAP_WIDTH_RATIO = 0.16;
const TACTICAL_MAP_HEIGHT = 112;
const TACTICAL_MAP_PAD = 10;
const ORDER_DASH = 14;
const ORDER_GAP = 9;
const RIFTLING_ATTACK_COOLDOWN_MS = 1500;
const RIFTLING_ATTACK_RANGE = 34;
const RIFTLING_SPEED: Record<Riftling["type"], number> = {
  shadow: 44,
  soldier: 34,
  bulwark: 23,
};

const ORDER_LABELS: Record<WorldActivityKind, string> = {
  shell: "FORGE",
  read: "SCOUT",
  edit: "BUILD",
  search: "SCAN",
  web: "PORTAL",
  permission: "HOLD",
  error: "DANGER",
  success: "DONE",
  subagent: "PARTY",
  prompt: "ASK",
  generic: "WORK",
};

const WORLD_STATE_LABELS: Record<WorldReadState, string> = {
  idle: "CALM",
  active: "ACTIVE",
  hold: "HOLD",
  pressure: "PRESSURE",
  sealed: "SEALED",
};

const WORLD_STATE_COLORS: Record<WorldReadState, number> = {
  idle: 0x6cc6ff,
  active: 0xffd86b,
  hold: 0xffb86c,
  pressure: 0xff5a3c,
  sealed: 0x7af0c0,
};

type BiomePalette = {
  ground: number;
  accent: number;
  lane: number;
  shadow: number;
};

const THEME_BIOMES: Record<WorldTheme, BiomePalette> = {
  citadel: {
    ground: 0x244d83,
    accent: 0xffd86b,
    lane: 0x9fd4ff,
    shadow: 0x09152b,
  },
  bastion: {
    ground: 0x251448,
    accent: 0xc9a4ff,
    lane: 0xffd86b,
    shadow: 0x070718,
  },
  crossroads: {
    ground: 0x3c2831,
    accent: 0xffb86c,
    lane: 0xffd86b,
    shadow: 0x120b17,
  },
  tide: {
    ground: 0x123b58,
    accent: 0x6cc6ff,
    lane: 0xf6d6a8,
    shadow: 0x061522,
  },
  dusk: {
    ground: 0x4a223a,
    accent: 0xff9fb5,
    lane: 0xffd86b,
    shadow: 0x180a1c,
  },
  lantern: {
    ground: 0x281239,
    accent: 0xff7a4a,
    lane: 0xc9a4ff,
    shadow: 0x080712,
  },
};

const THEME_TILE_TINT: Record<WorldTheme, [number, number]> = {
  citadel: [0xc9ddff, 0x9fc2ff],
  bastion: [0x7a5db7, 0x4b367f],
  crossroads: [0xd08a4f, 0x9d5f36],
  tide: [0xf4d5a4, 0x8ed5ff],
  dusk: [0xf2a0ad, 0xb77aa0],
  lantern: [0x7c5a9f, 0x4c2c66],
};

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
  citadel: [
    { tx: 1, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 0.5, ty: 1.5, scale: 0.45, alpha: 0.6 },
    { tx: 4.5, ty: 1.5, scale: 0.45, alpha: 0.6 },
    { tx: 2.5, ty: 5.2, scale: 0.5, alpha: 0.7 },
  ],
  bastion: [
    { tx: 1, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 4, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 1.2, ty: 1.2, scale: 0.5, alpha: 0.75 },
    { tx: 3.8, ty: 1.2, scale: 0.5, alpha: 0.75 },
  ],
  crossroads: [
    { tx: 1, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.7, alpha: 0.85 },
    { tx: 0.6, ty: 0.6, scale: 0.5, alpha: 0.7 },
    { tx: 4.4, ty: 0.6, scale: 0.5, alpha: 0.7 },
    { tx: 2.5, ty: 5.5, scale: 0.55, alpha: 0.75 },
  ],
  tide: [
    { tx: 1, ty: 4, scale: 0.6, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.6, alpha: 0.9 },
    { tx: 0.4, ty: 2.5, scale: 0.4, alpha: 0.65 },
    { tx: 4.6, ty: 2.5, scale: 0.4, alpha: 0.65 },
    { tx: 2.5, ty: 5.6, scale: 0.5, alpha: 0.7 },
  ],
  dusk: [
    { tx: 1, ty: 4, scale: 0.6, alpha: 0.85 },
    { tx: 4, ty: 4, scale: 0.6, alpha: 0.85 },
    { tx: 1.2, ty: 1.5, scale: 0.45, alpha: 0.65 },
    { tx: 3.8, ty: 1.5, scale: 0.45, alpha: 0.65 },
    { tx: 2.5, ty: 5.2, scale: 0.5, alpha: 0.7 },
  ],
  lantern: [
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
type ThemeParticle = {
  color: number;
  count: number;
  speed: number;
  size: number;
};
const THEME_PARTICLES: Record<WorldTheme, ThemeParticle> = {
  citadel: { color: 0xffd86b, count: 8, speed: 0.04, size: 1.2 }, // gold sparkle
  bastion: { color: 0xc9a4ff, count: 12, speed: 0.06, size: 1.0 }, // dark embers
  crossroads: { color: 0xffd86b, count: 6, speed: 0.05, size: 1.2 }, // lamp dust
  tide: { color: 0xb3e0ff, count: 10, speed: 0.05, size: 1.0 }, // sea spray
  dusk: { color: 0xffb86c, count: 8, speed: 0.05, size: 1.2 }, // dusk fireflies
  lantern: { color: 0xff7a4a, count: 14, speed: 0.07, size: 1.2 }, // ash flecks
};

const ALERT_RING_COLOR: Record<WorldAlertLevel, number> = {
  idle: 0x2a3556,
  active: 0x6cc6ff,
  warning: 0xffb86c,
  danger: 0xff5a3c,
  cleared: 0xffd86b,
};

const ACTIVITY_MOOD_MS = 6000;
const IDLE_QUIRK_MIN_MS = 4200;
const IDLE_QUIRK_MAX_MS = 8200;
const IDLE_QUIRK_DURATION_MS = 3600;
const RESULT_STREAK_POSE_MS = 1800;
const CAMERA_PUNCTUATION_COOLDOWN_MS = 900;
const FINE_DETAIL_FADE_MIN_ZOOM = 0.19;
const FINE_DETAIL_FADE_FULL_ZOOM = 0.39;
const WORLD_CULL_PAD = 360;
const LETTER_SIGNAL_MS = 1500;
const RENOWN_SIGNAL_MS = 2400;
const MISSION_FORMATION_ORDER = [0, 3, 1, 4, 2, 5] as const;

type IdleQuirkKind = "watch" | "garden" | "forge" | "tide";
type ResultPoseKind = "success" | "error";
type RenownTier = "New" | "Apprentice" | "Veteran" | "Hero";
type WorldReadState = "idle" | "active" | "hold" | "pressure" | "sealed";

type WielderRef = {
  unitId: string;
  role: UnitState["role"];
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  sprite?: Phaser.GameObjects.Sprite;
  glow: Phaser.GameObjects.Arc;
  auraRing: Phaser.GameObjects.Arc;
  // FF14 nameplate-style HP/MP bars stacked below the wielder. Each
  // bar is a dark track + a colored fill rectangle whose width we
  // scale per frame based on the unit's hp/mp fraction.
  hpBarBg: Phaser.GameObjects.Rectangle;
  hpBarFill: Phaser.GameObjects.Rectangle;
  mpBarBg: Phaser.GameObjects.Rectangle;
  mpBarFill: Phaser.GameObjects.Rectangle;
  orderLine: Phaser.GameObjects.Graphics;
  orderRing: Phaser.GameObjects.Arc;
  orderLabel: Phaser.GameObjects.Text;
  jobGfx: Phaser.GameObjects.Graphics;
  jobPhase: number;
  idleGfx: Phaser.GameObjects.Graphics;
  idleQuirkKind: IdleQuirkKind;
  idleQuirkPhase: number;
  idleQuirkNextAt: number;
  idleQuirkUntil: number;
  streakGfx: Phaser.GameObjects.Graphics;
  streakPoseKind?: ResultPoseKind;
  streakPoseUntil: number;
  successStreak: number;
  errorStreak: number;
  // Bobbing "!" alert icon shown above the head when HP is critical
  // (or the wielder has just fallen). Hidden otherwise.
  criticalAlert: Phaser.GameObjects.Text;
  // Currently-displayed speech bubble (if any) + last-shown timestamp
  // for cooldown gating. New barks replace the old one.
  barkText?: Phaser.GameObjects.Text;
  lastBarkAt: number;
  label: Phaser.GameObjects.Text;
  homeIndex: number;
  formationSlot?: number;
  locationMode: "base" | "mission";
  locationTargetKey?: string;
  isTraveling: boolean;
  missionHoldUntil: number;
  renownTier: RenownTier;
  renownScore: number;
  // Patrol state machine.
  patrolState: "scouting" | "walking" | "arrived";
  patrolTarget?: { x: number; y: number };
  patrolNextSwitchAt: number;
  // Last-known status, for change detection (death/victory pose, etc).
  lastStatus: UnitState["status"];
  lastWardenAura?: WardenAura;
  // Animation lockout — most recent event-driven anim trigger time.
  // Per-wielder so we don't spam attack/cast frames during bursts.
  lastEventAnimAt: number;
  currentAnim?: string;
  // Subagent tether to parent (rendered on the scene-global agent layer).
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
  biome: Phaser.GameObjects.Graphics;
  stateGfx: Phaser.GameObjects.Graphics;
  workGfx: Phaser.GameObjects.Graphics;
  missionPads: Phaser.GameObjects.Arc[];
  todOverlay: Phaser.GameObjects.Ellipse;
  breathOverlay: Phaser.GameObjects.Ellipse;
  eventOverlay: Phaser.GameObjects.Ellipse;
  alertRing: Phaser.GameObjects.Arc;
  selectionRing: Phaser.GameObjects.Arc;
  stateLabelBg: Phaser.GameObjects.Rectangle;
  stateLabel: Phaser.GameObjects.Text;
  countText: Phaser.GameObjects.Text;
  countBg: Phaser.GameObjects.Rectangle;
  theme: WorldTheme;
  alertLevel: WorldAlertLevel;
  spawnedAt: number;
  wielders: Map<string, WielderRef>;
  riftling: Map<string, RiftlingRef>;
  particles: {
    circle: Phaser.GameObjects.Arc;
    vx: number;
    vy: number;
    baseAlpha: number;
    phase: number;
  }[];
  // Tier 2 — per-theme animated atmospherics drawn on the iso plane.
  // Only populated for themes that have a signature effect (water, fire,
  // magic). Redrawn each frame from the theme's draw routine.
  atmospherics?: Phaser.GameObjects.Graphics;
  atmosPhase: number;
  breathPhase: number;
  lastActivityKind?: WorldActivityKind;
  lastActivityAt: number;
  lastActivityColor: number;
  missionPadPhase: number;
};

type ClusterRef = {
  key: string;
  centroid: { x: number; y: number };
  label: Phaser.GameObjects.Text;
};

type BaseRef = {
  container: Phaser.GameObjects.Container;
  isoPlane: Phaser.GameObjects.Container;
  commandGfx: Phaser.GameObjects.Graphics;
  beacon: Phaser.GameObjects.Arc;
  pads: Phaser.GameObjects.Arc[];
  phase: number;
};

type StarRef = {
  circle: Phaser.GameObjects.Arc;
  twinklePhase: number;
  baseAlpha: number;
};

type TacticalMapState = {
  screenX: number;
  screenY: number;
  layout: TacticalMapLayout;
  bounds: TacticalBounds;
  viewport: TacticalRect;
  worldPoints: Array<{
    worldId: string;
    point: TacticalPoint;
    radius: number;
  }>;
};

export class KingdomScene extends Phaser.Scene {
  private worlds = new Map<string, WorldRef>();
  private clusters = new Map<string, ClusterRef>();
  private base?: BaseRef;
  private agentLayer?: Phaser.GameObjects.Container;
  private realmGfx?: Phaser.GameObjects.Graphics;
  private routeGfx?: Phaser.GameObjects.Graphics;
  private routeTrafficGfx?: Phaser.GameObjects.Graphics;
  private miniMapGfx?: Phaser.GameObjects.Graphics;
  private miniMapLabel?: Phaser.GameObjects.Text;
  private miniMapHitArea?: Phaser.GameObjects.Rectangle;
  private hudCamera?: Phaser.Cameras.Scene2D.Camera;
  private tacticalMapState?: TacticalMapState;
  private tacticalMapDragMode: "pan" | null = null;
  private layout = new Map<
    string,
    { x: number; y: number; clusterKey: string }
  >();
  private skyGfx?: Phaser.GameObjects.Graphics;
  private scanline?: Phaser.GameObjects.TileSprite;
  private stars: StarRef[] = [];
  private dragOriginScroll: { x: number; y: number } | null = null;
  private dragOriginPointer: { x: number; y: number } | null = null;
  private didDrag = false;
  private lastWorldsKey = "";
  private lastCameraTargetVersion = 0;
  private seenLetterIds = new Set<string>();
  private seenLetterCounts = new Map<string, number>();
  private renownTiers = new Map<string, RenownTier>();
  private lastUserCamMs = 0;
  private t = 0;
  private lastCameraPunctuationAt = -CAMERA_PUNCTUATION_COOLDOWN_MS;
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
      "citadel",
      "bastion",
      "crossroads",
      "tide",
      "dusk",
      "lantern",
    ];
    for (const t of themes) {
      this.load.image(
        LANDMARK_TEX(t),
        `/sprites/rw-default/${LANDMARK_TEX(t)}.png`
      );
    }
    this.load.image("tile-iso-a", "/sprites/rw-default/tile-iso-a.png");
    this.load.image("tile-iso-b", "/sprites/rw-default/tile-iso-b.png");

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

    // Riftling sheets — 32×32 frames, 8 per sheet.
    this.load.spritesheet(
      "riftling-shadow-sheet",
      "/sprites/rw-default/riftling-shadow_sheet.png",
      { frameWidth: 32, frameHeight: 32 }
    );
    this.load.spritesheet(
      "riftling-soldier-sheet",
      "/sprites/rw-default/riftling-soldier_sheet.png",
      { frameWidth: 32, frameHeight: 32 }
    );
    this.load.spritesheet(
      "riftling-bulwark-sheet",
      "/sprites/rw-default/riftling-bulwark_sheet.png",
      { frameWidth: 32, frameHeight: 32 }
    );
  }

  create() {
    this.cameras.main.setBackgroundColor("#04060d");

    // Tier 1 filter stack — shared across the whole map
    const cm = this.cameras.main.filters.internal.addColorMatrix();
    cm.colorMatrix.saturate(0.15, true).hue(-6, true).contrast(0.05, true);
    this.bloomFilter = this.cameras.main.filters.internal.addGlow(
      0xffd86b,
      0.45,
      0.25,
      1,
      false,
      4,
      8
    );
    this.cameras.main.filters.internal.addVignette(0.5, 0.5, 0.85, 0.5);

    // Tier 3 — event-driven filters held at neutral until pulsed.
    // Barrel.amount=1 is identity; pinch (<1) for KO impact distortion.
    // Pixelate.amount=0 is identity; spike briefly for KO screen-thump.
    this.barrelFilter = this.cameras.main.filters.internal.addBarrel(1);
    this.pixelateFilter = this.cameras.main.filters.internal.addPixelate(0);

    // Sky + stars (viewport-locked so they don't pan with the world)
    this.drawSky();
    this.spawnStars(140);
    this.realmGfx = this.add.graphics().setDepth(-70);
    this.routeGfx = this.add.graphics().setDepth(-45);
    this.routeTrafficGfx = this.add.graphics().setDepth(-34);
    this.miniMapGfx = this.add.graphics().setDepth(1300);
    this.miniMapLabel = this.add
      .text(0, 0, "TACTICAL MAP", {
        fontSize: "12px",
        color: "#ffd86b",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        letterSpacing: 1,
      })
      .setDepth(1301)
      .setAlpha(0.92);
    this.miniMapHitArea = this.add
      .rectangle(0, 0, 1, 1, 0x000000, 0)
      .setOrigin(0, 0)
      .setDepth(1302)
      .setScrollFactor(0)
      .setInteractive(
        new Phaser.Geom.Rectangle(0, 0, 1, 1),
        Phaser.Geom.Rectangle.Contains
      );
    this.installTacticalMapInput(this.miniMapHitArea);
    this.hudCamera = this.cameras.add(
      0,
      0,
      this.scale.width,
      this.scale.height,
      false,
      "hud"
    );
    this.hudCamera.setScroll(0, 0).setZoom(1);
    this.cameras.main.ignore([
      this.miniMapGfx,
      this.miniMapLabel,
      this.miniMapHitArea,
    ]);
    this.base = this.spawnKingdomBase();
    this.agentLayer = this.add.container(0, 0).setDepth(60);

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

    const initialState = useStore.getState();
    this.seenLetterIds = new Set(initialState.letters.map((l) => l.id));
    this.seenLetterCounts = new Map(
      initialState.letters.map((l) => [l.id, l.count ?? 1])
    );
    this.renownTiers = new Map(
      Object.entries(initialState.persisted.wielders).map(([id, stats]) => [
        id,
        renownForStats(stats).tier,
      ])
    );
    const initialWorldsKey = Object.keys(initialState.worlds).sort().join(",");
    if (initialWorldsKey) {
      this.syncWorlds(initialState.worlds);
      this.lastWorldsKey = initialWorldsKey;
      this.drawTacticalMiniMap(initialState.worlds, initialState.units);
    }

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
      if (!this.canCreateGameObjects()) return;
      // Find the wielder by sessionId (across all worlds).
      let ref: WielderRef | undefined;
      let worldRef: WorldRef | undefined;
      for (const w of this.worlds.values()) {
        const candidate = w.wielders.get(ev.sessionId);
        if (candidate) {
          ref = candidate;
          worldRef = w;
          break;
        }
      }
      if (!ref) return;
      if (worldRef) {
        this.holdMissionForEvent(ref, ev);
        this.triggerWorldEventVfx(worldRef, ref, ev);
        const resultKind =
          ev.kind === "tool_result" || ev.kind === "error"
            ? activityForEvent(ev)
            : null;
        if (resultKind === "success" || resultKind === "error") {
          this.recordResultPose(worldRef, ref, resultKind);
        }
      }

      // Voice bark — independent of sprite/anim timing. Bark on the
      // less-frequent narrative events; tool_use / tool_result skip
      // (would spam the canvas). KO vs success branch on unit hp at
      // session_end time.
      let barkKind: BarkKind | undefined;
      if (ev.kind === "session_start") barkKind = "session_start";
      else if (ev.kind === "subagent_spawn") barkKind = "subagent_spawn";
      else if (ev.kind === "permission_request")
        barkKind = "permission_request";
      else if (ev.kind === "error") barkKind = "error";
      else if (ev.kind === "session_end") {
        const u = useStore.getState().units[ev.sessionId];
        barkKind = u && u.hp <= 0 ? "session_end_ko" : "session_end_success";
      }
      if (barkKind) {
        this.showBark(ref, pickBarkLine(barkKind, ref.role));
      }

      if (!ref.sprite) return;
      if (now - ref.lastEventAnimAt < MIN_GAP_MS) return;
      let animKey: string | undefined;
      if (ev.kind === "tool_use") {
        const toolName = String(ev.payload.name ?? "");
        if (worldRef) this.spawnToolVfx(worldRef, ref, toolName);
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
    window.addEventListener("rw:event", eventHandler as EventListener);

    this.events.once("shutdown", () => {
      window.removeEventListener("rw:event", eventHandler as EventListener);
      this.worlds.clear();
      this.stars = [];
      this.base = undefined;
      this.agentLayer = undefined;
      this.realmGfx = undefined;
      this.skyGfx = undefined;
      this.routeGfx = undefined;
      this.routeTrafficGfx = undefined;
      this.miniMapGfx = undefined;
      this.miniMapLabel = undefined;
      this.miniMapHitArea = undefined;
      this.hudCamera = undefined;
      this.tacticalMapState = undefined;
      this.tacticalMapDragMode = null;
      useStore.getState().setWorldCommandAnchor(null);
      this.scanline = undefined;
      this.lastWorldsKey = "";
      this.lastCameraTargetVersion = 0;
      this.seenLetterIds.clear();
      this.seenLetterCounts.clear();
      this.renownTiers.clear();
    });
  }

  update(_time: number, delta: number) {
    this.t += delta * 0.001;
    this.updateViewportBackdrops();

    // Sync world planets
    const storeState = useStore.getState();
    const worlds = storeState.worlds;
    const key = Object.keys(worlds).sort().join(",");
    if (key !== this.lastWorldsKey) {
      this.syncWorlds(worlds);
      this.lastWorldsKey = key;
    }
    this.enforceStrategyZoomFloor();

    // Update per-world live state (count, alert ring color, wielders)
    const units = storeState.units;
    for (const [id, ref] of this.worlds) {
      const w = worlds[id];
      if (!w) continue;
      ref.countText.setText(String(w.unitIds.length));
      ref.countBg.setVisible(w.unitIds.length > 0);
      ref.countText.setVisible(w.unitIds.length > 0);
      if (w.alertLevel !== ref.alertLevel) {
        ref.alertRing.setStrokeStyle(2.5, ALERT_RING_COLOR[w.alertLevel], 1);
        // Tier 3 — golden bloom flare on realm seal seal (any → cleared).
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
      const selected = storeState.activeWorldId === id;
      ref.selectionRing.setVisible(selected);
      if (selected) {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 3.2);
        ref.selectionRing
          .setStrokeStyle(2.2, 0xffd86b, 0.56 + pulse * 0.26)
          .setScale(1.02 + pulse * 0.04);
      }
      this.tickWorldStateLayer(ref, w, units);

      // Sync wielders + riftling for this world.
      this.syncWieldersFor(ref, w, units, delta);
      this.syncRiftlingFor(ref, w);
      if (this.isWorldNearViewport(ref)) {
        this.tickRiftlingCombat(ref, w, units, delta);
        // Time-of-day tint per-world based on session age.
        this.updateTimeOfDay(ref);
        // Drift particles inside this world's iso footprint.
        this.tickWorldParticles(ref, delta);
        // Tier 2 — per-theme animated atmosphere (water, fire, magic).
        this.tickWorldAtmospherics(ref, delta);
        this.updateWorldBreath(ref, w, units);
        this.tickWorldBiome(ref, w, units, delta);
        this.tickWorldWorkSites(ref, w, units);
      } else {
        ref.workGfx.clear();
      }
    }

    this.tickKingdomBase(delta, units);
    this.syncLetterSignals(storeState.letters, units);
    this.syncRenownSignals(units, storeState.persisted.wielders);
    this.drawRouteTraffic(storeState.worlds, units);
    this.drawTacticalMiniMap(storeState.worlds, units);
    this.syncWorldCommandAnchor(storeState.activeWorldId);
    this.syncHudCameraLayer();

    // Twinkle stars
    for (const s of this.stars) {
      s.twinklePhase += delta * 0.001;
      s.circle.setAlpha(s.baseAlpha * (0.6 + 0.4 * Math.sin(s.twinklePhase)));
    }

    // Cluster labels fade in at zoom-out (zoom < 0.7), out at zoom-in.
    // Per Q40 cascading defaults: cluster labels visible at zoom-out only.
    const z = this.cameras.main.zoom;
    const targetAlpha =
      z < 0.45 ? 0.95 : z < 0.7 ? ((0.7 - z) / 0.25) * 0.95 : 0;
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
          const focusX = Phaser.Math.Linear(0, ref.container.x, 0.6);
          const focusY = Phaser.Math.Linear(0, ref.container.y, 0.6);
          this.cameras.main.pan(focusX, focusY, 400, "Sine.easeInOut");
          // Zoom in enough for the selected mission to be legible while
          // keeping the central base in context.
          const cam = this.cameras.main;
          if (cam.zoom < WORLD_FOCUS_ZOOM) {
            cam.zoomTo(WORLD_FOCUS_ZOOM, 400, "Sine.easeInOut");
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

  // Golden bloom flare when a world's realm seal is sealed.
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

  private canCreateGameObjects() {
    try {
      return Boolean(
        this.add &&
        this.tweens &&
        this.time &&
        this.scene &&
        this.scene.isActive()
      );
    } catch {
      return false;
    }
  }

  private triggerWorldEventVfx(
    worldRef: WorldRef,
    ref: WielderRef,
    event: AgentEvent
  ) {
    const kind = activityForEvent(event);
    if (!kind || !this.canCreateGameObjects()) return;
    const color = activityColorForTheme(worldRef.theme, kind);
    worldRef.lastActivityKind = kind;
    worldRef.lastActivityAt = this.time.now;
    worldRef.lastActivityColor = color;

    const overlayAlpha =
      kind === "error" ? 0.34 : kind === "permission" ? 0.26 : 0.18;
    this.tweens.killTweensOf(worldRef.eventOverlay);
    worldRef.eventOverlay.setFillStyle(color, overlayAlpha).setAlpha(1);
    this.tweens.add({
      targets: worldRef.eventOverlay,
      alpha: 0,
      duration: kind === "permission" ? 1100 : 720,
      ease: "Sine.easeOut",
    });

    this.tweens.killTweensOf(worldRef.alertRing);
    this.tweens.add({
      targets: worldRef.alertRing,
      scale: { from: 1.09, to: 1 },
      duration: 360,
      ease: "Back.easeOut",
    });

    if (event.kind !== "tool_use") {
      this.spawnActivityGlyph(ref, kind, color);
    }
    if (kind === "subagent" || kind === "web") {
      this.pulseRoutesFromWorld(worldRef, color);
    }
    this.punctuateCameraForEvent(worldRef, kind, event);
  }

  private recordResultPose(
    worldRef: WorldRef,
    ref: WielderRef,
    kind: ResultPoseKind
  ) {
    if (kind === "success") {
      ref.successStreak += 1;
      ref.errorStreak = 0;
      if (ref.successStreak < 3 || ref.successStreak % 3 !== 0) return;
    } else {
      ref.errorStreak += 1;
      ref.successStreak = 0;
    }

    ref.streakPoseKind = kind;
    ref.streakPoseUntil = this.time.now + RESULT_STREAK_POSE_MS;
    const color =
      kind === "success"
        ? activityColorForTheme(worldRef.theme, "success")
        : activityColorForTheme(worldRef.theme, "error");
    this.spawnResultStreakBurst(
      ref,
      kind,
      color,
      kind === "success" ? ref.successStreak : ref.errorStreak
    );
  }

  private spawnResultStreakBurst(
    ref: WielderRef,
    kind: ResultPoseKind,
    color: number,
    streak: number
  ) {
    const x = ref.container.x;
    const y = ref.container.y - 48;
    const g = this.add.graphics().setPosition(x, y).setDepth(73);
    g.fillStyle(color, 0.14);
    g.fillCircle(0, 0, 18);
    g.lineStyle(2.4, color, 0.92);
    if (kind === "success") {
      g.beginPath();
      g.moveTo(-9, -1);
      g.lineTo(-3, 7);
      g.lineTo(12, -10);
      g.strokePath();
      for (let i = 0; i < Math.min(streak, 6); i++) {
        const a = -Math.PI + i * (Math.PI / 5);
        g.fillStyle(color, 0.72);
        g.fillCircle(Math.cos(a) * 24, Math.sin(a) * 10, 1.8);
      }
    } else {
      g.beginPath();
      g.moveTo(-9, -10);
      g.lineTo(9, 10);
      g.moveTo(9, -10);
      g.lineTo(-9, 10);
      g.strokePath();
      g.lineStyle(1.2, color, 0.52);
      g.strokeCircle(0, 0, 25);
    }
    const label = this.add
      .text(x, y + 22, kind === "success" ? `CHAIN ${streak}` : "BREAK", {
        fontSize: "7px",
        color: "#fff8e0",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.76)",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(74);
    this.agentLayer?.add([g, label]);
    this.tweens.add({
      targets: [g, label],
      y: "-=22",
      alpha: 0,
      scale: 1.18,
      duration: 950,
      ease: "Cubic.easeOut",
      onComplete: () => {
        g.destroy();
        label.destroy();
      },
    });
  }

  private punctuateCameraForEvent(
    worldRef: WorldRef,
    kind: WorldActivityKind,
    event: AgentEvent
  ) {
    if (
      event.kind !== "permission_request" &&
      event.kind !== "error" &&
      event.kind !== "subagent_spawn"
    ) {
      return;
    }
    if (
      this.time.now - this.lastCameraPunctuationAt <
      CAMERA_PUNCTUATION_COOLDOWN_MS
    ) {
      return;
    }

    this.lastCameraPunctuationAt = this.time.now;
    const cam = this.cameras.main;
    if (kind === "error") {
      cam.shake(220, 0.004, true);
      cam.flash(180, 255, 90, 60, false);
    } else if (kind === "permission" || kind === "prompt") {
      cam.flash(160, 255, 184, 108, false);
      cam.shake(140, 0.0016, true);
    } else if (kind === "subagent") {
      cam.flash(180, 255, 216, 107, false);
    }

    if (performance.now() - this.lastUserCamMs > 2500) {
      cam.pan(
        Phaser.Math.Linear(0, worldRef.container.x, 0.52),
        Phaser.Math.Linear(0, worldRef.container.y, 0.52),
        320,
        "Sine.easeInOut"
      );
    }
  }

  private syncLetterSignals(
    letters: readonly Letter[],
    units: Record<string, UnitState>
  ) {
    const liveIds = new Set<string>();
    for (const letter of [...letters].sort(
      (a, b) => a.createdAt - b.createdAt
    )) {
      liveIds.add(letter.id);
      const nextCount = letter.count ?? 1;
      const previousCount = this.seenLetterCounts.get(letter.id);
      if (!this.seenLetterIds.has(letter.id)) {
        this.seenLetterIds.add(letter.id);
        this.seenLetterCounts.set(letter.id, nextCount);
        this.triggerLetterSignal(letter, units);
      } else if (previousCount !== undefined && nextCount > previousCount) {
        this.seenLetterCounts.set(letter.id, nextCount);
        this.triggerLetterSignal(letter, units);
      }
    }

    if (this.seenLetterIds.size <= 96) return;
    for (const id of [...this.seenLetterIds]) {
      if (liveIds.has(id)) continue;
      this.seenLetterIds.delete(id);
      this.seenLetterCounts.delete(id);
    }
  }

  private triggerLetterSignal(
    letter: Letter,
    units: Record<string, UnitState>
  ) {
    const unit = letter.sessionId ? units[letter.sessionId] : undefined;
    const target = unit ? this.findWielderRef(unit.id) : undefined;
    const worldRef =
      (letter.worldId ? this.worlds.get(letter.worldId) : undefined) ??
      target?.worldRef;
    const color = letterSignalColor(letter);
    const kind = letterActivityKind(letter);
    const label = letterSignalLabel(letter);

    this.spawnBaseSignal(color, label);
    if (worldRef) {
      worldRef.lastActivityKind = kind;
      worldRef.lastActivityAt = this.time.now;
      worldRef.lastActivityColor = color;
      this.tweens.killTweensOf(worldRef.eventOverlay);
      worldRef.eventOverlay
        .setFillStyle(color, letter.severity === "critical" ? 0.34 : 0.24)
        .setAlpha(1);
      this.tweens.add({
        targets: worldRef.eventOverlay,
        alpha: 0,
        duration: LETTER_SIGNAL_MS,
        ease: "Sine.easeOut",
      });
      this.tweens.killTweensOf(worldRef.alertRing);
      this.tweens.add({
        targets: worldRef.alertRing,
        scale: { from: 1.16, to: 1 },
        duration: 520,
        ease: "Back.easeOut",
      });
      this.pulseRoutesFromWorld(worldRef, color);
      this.spawnLetterWorldSignal(worldRef, letter, color, label);
    }

    if (target) {
      this.spawnLetterWielderSignal(target.ref, letter, color, label);
    }

    if (
      letter.severity === "critical" &&
      this.time.now - this.lastCameraPunctuationAt >
        CAMERA_PUNCTUATION_COOLDOWN_MS
    ) {
      this.lastCameraPunctuationAt = this.time.now;
      this.cameras.main.flash(180, 255, 90, 60, false);
      this.cameras.main.shake(180, 0.0022, true);
    }
  }

  private findWielderRef(unitId: string) {
    for (const worldRef of this.worlds.values()) {
      const ref = worldRef.wielders.get(unitId);
      if (ref) return { worldRef, ref };
    }
    return undefined;
  }

  private spawnBaseSignal(color: number, label: string) {
    const base = this.base;
    if (!base) return;
    const center = this.baseIsoToLocal(BASE_GRID_W / 2, BASE_GRID_H / 2);
    const g = this.add
      .graphics()
      .setPosition(center.x, center.y - 62)
      .setDepth(66);
    g.lineStyle(2.4, color, 0.72);
    g.strokeCircle(0, 0, 32);
    g.lineStyle(1.2, color, 0.36);
    g.strokeCircle(0, 0, 52);
    g.fillStyle(color, 0.18);
    g.fillCircle(0, 0, 42);
    const text = this.add
      .text(center.x, center.y - 104, label, {
        fontSize: "7px",
        color: "#fff8e0",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.72)",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(67);
    this.agentLayer?.add([g, text]);
    this.tweens.add({
      targets: [g, text],
      alpha: 0,
      scale: 1.42,
      duration: LETTER_SIGNAL_MS,
      ease: "Cubic.easeOut",
      onComplete: () => {
        g.destroy();
        text.destroy();
      },
    });
  }

  private spawnLetterWorldSignal(
    worldRef: WorldRef,
    letter: Letter,
    color: number,
    label: string
  ) {
    const x = worldRef.container.x;
    const y = worldRef.container.y - 66;
    const g = this.add.graphics().setPosition(x, y).setDepth(68);
    this.drawLetterEnvelope(g, color, letter.severity === "critical" ? 1 : 0.8);
    g.lineStyle(1.4, color, 0.5);
    g.strokeEllipse(0, 68, 112, 32);
    const text = this.add
      .text(x, y + 26, label, {
        fontSize: "7px",
        color: "#fff8e0",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.72)",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(69);
    this.agentLayer?.add([g, text]);
    this.tweens.add({
      targets: [g, text],
      y: "-=20",
      alpha: 0,
      scale: 1.2,
      duration: LETTER_SIGNAL_MS,
      ease: "Cubic.easeOut",
      onComplete: () => {
        g.destroy();
        text.destroy();
      },
    });
  }

  private spawnLetterWielderSignal(
    ref: WielderRef,
    letter: Letter,
    color: number,
    label: string
  ) {
    const x = ref.container.x;
    const y = ref.container.y - 58;
    const g = this.add.graphics().setPosition(x, y).setDepth(74);
    this.drawLetterEnvelope(g, color, letter.severity === "critical" ? 1 : 0.8);
    const text = this.add
      .text(x, y + 16, label, {
        fontSize: "7px",
        color: "#fff8e0",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.78)",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(75);
    this.agentLayer?.add([g, text]);
    this.tweens.add({
      targets: [g, text],
      y: "-=24",
      alpha: 0,
      scale: 1.16,
      duration: 1100,
      ease: "Cubic.easeOut",
      onComplete: () => {
        g.destroy();
        text.destroy();
      },
    });
  }

  private drawLetterEnvelope(
    g: Phaser.GameObjects.Graphics,
    color: number,
    alpha: number
  ) {
    g.fillStyle(0x020713, 0.72);
    g.fillRoundedRect(-17, -11, 34, 22, 4);
    g.lineStyle(1.4, color, alpha);
    g.strokeRoundedRect(-17, -11, 34, 22, 4);
    g.lineStyle(1.1, color, alpha * 0.72);
    g.beginPath();
    g.moveTo(-15, -9);
    g.lineTo(0, 2);
    g.lineTo(15, -9);
    g.moveTo(-15, 9);
    g.lineTo(-3, -1);
    g.moveTo(15, 9);
    g.lineTo(3, -1);
    g.strokePath();
    g.fillStyle(color, 0.16);
    g.fillCircle(0, 0, 25);
  }

  private syncRenownSignals(
    units: Record<string, UnitState>,
    persistedWielders: Record<string, WielderStats>
  ) {
    for (const unit of Object.values(units)) {
      const identity = unitIdentityForUnit(unit);
      const renown = renownForStats(persistedWielders[identity]);
      const previousTier = this.renownTiers.get(identity);
      if (!previousTier) {
        this.renownTiers.set(identity, renown.tier);
        continue;
      }
      if (renownRank(renown.tier) > renownRank(previousTier)) {
        this.renownTiers.set(identity, renown.tier);
        const target = this.findWielderRef(unit.id);
        if (target) {
          target.ref.renownTier = renown.tier;
          target.ref.renownScore = renown.score;
          this.triggerRenownSignal(target.worldRef, target.ref, renown);
        }
      } else if (renown.tier !== previousTier) {
        this.renownTiers.set(identity, renown.tier);
      }
    }
  }

  private triggerRenownSignal(
    worldRef: WorldRef,
    ref: WielderRef,
    renown: ReturnType<typeof renownForStats>
  ) {
    const color = ROLE_PALETTE[ref.role].color;
    const x = ref.container.x;
    const y = ref.container.y - 24;
    const g = this.add.graphics().setPosition(x, y).setDepth(76);
    g.fillStyle(0xffd86b, 0.16);
    g.fillCircle(0, 0, 30);
    g.lineStyle(2.4, 0xffd86b, 0.9);
    g.strokeCircle(0, 0, 28);
    g.lineStyle(1.3, color, 0.72);
    g.strokeCircle(0, 0, 42);
    for (let i = 0; i < renown.stars.length; i++) {
      const a = -Math.PI / 2 + i * 0.42 - (renown.stars.length - 1) * 0.21;
      const sx = Math.cos(a) * 33;
      const sy = Math.sin(a) * 18;
      g.fillStyle(0xfff4c7, 0.88);
      g.fillCircle(sx, sy, 3.2);
      g.lineStyle(1.1, 0xfff4c7, 0.78);
      g.lineBetween(sx - 5, sy, sx + 5, sy);
      g.lineBetween(sx, sy - 5, sx, sy + 5);
    }
    const text = this.add
      .text(x, y - 42, renown.tier.toUpperCase(), {
        fontSize: "8px",
        color: "#fff8e0",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.82)",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5)
      .setDepth(77);
    this.agentLayer?.add([g, text]);
    worldRef.lastActivityKind = "success";
    worldRef.lastActivityAt = this.time.now;
    worldRef.lastActivityColor = 0xffd86b;
    this.spawnBaseSignal(0xffd86b, "RENOWN");
    this.showBark(ref, `${renown.tier} renown.`);
    this.tweens.add({
      targets: [g, text],
      alpha: 0,
      scale: 1.52,
      duration: RENOWN_SIGNAL_MS,
      ease: "Cubic.easeOut",
      onComplete: () => {
        g.destroy();
        text.destroy();
      },
    });
  }

  private spawnToolVfx(worldRef: WorldRef, ref: WielderRef, toolName: string) {
    if (!this.canCreateGameObjects()) return;
    const kind = activityForToolName(toolName);
    const color = activityColorForTheme(worldRef.theme, kind);
    this.spawnActivityGlyph(ref, kind, color);
    this.spawnRoleDeliveryVfx(worldRef, ref, kind, color);
    if (kind === "subagent" || kind === "web") {
      this.pulseRoutesFromWorld(worldRef, color);
    }
  }

  private spawnRoleDeliveryVfx(
    worldRef: WorldRef,
    ref: WielderRef,
    kind: WorldActivityKind,
    color: number
  ) {
    const fromX = ref.container.x;
    const fromY = ref.container.y - 10;
    const toX = worldRef.container.x;
    const toY = worldRef.container.y + 6;
    const g = this.add.graphics().setDepth(69);
    const wave = kind === "error" ? 0.3 : kind === "success" ? 0.85 : 0.55;

    if (ref.role === "warden1") {
      g.lineStyle(5, 0x020713, 0.42);
      g.lineBetween(fromX, fromY, toX, toY);
      g.lineStyle(2.2, color, 0.78);
      g.lineBetween(fromX, fromY, toX, toY);
      g.fillStyle(color, 0.85);
      g.fillCircle(
        Phaser.Math.Linear(fromX, toX, wave),
        Phaser.Math.Linear(fromY, toY, wave),
        3
      );
    } else if (ref.role === "warden2") {
      g.lineStyle(1.6, color, 0.52);
      for (let i = 0; i < 3; i++) {
        g.strokeCircle(fromX, fromY + 10, 12 + i * 9);
      }
      g.fillStyle(color, 0.2);
      g.fillCircle(toX, toY, 20);
      g.lineStyle(2, color, 0.54);
      g.strokeCircle(toX, toY, 24);
    } else if (ref.role === "warden3") {
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const slashX = fromX + Math.cos(angle) * 28;
      const slashY = fromY + Math.sin(angle) * 18;
      g.lineStyle(7, 0x020713, 0.38);
      g.lineBetween(fromX - 16, fromY + 13, slashX + 32, slashY - 18);
      g.lineStyle(3, color, 0.86);
      g.lineBetween(fromX - 16, fromY + 13, slashX + 32, slashY - 18);
      g.fillStyle(0xfff4c7, 0.82);
      g.fillCircle(slashX + 28, slashY - 18, 2.4);
    } else {
      g.lineStyle(1.4, color, 0.58);
      g.beginPath();
      g.moveTo(fromX, fromY);
      g.lineTo(Phaser.Math.Linear(fromX, toX, 0.42), fromY - 28);
      g.lineTo(toX, toY);
      g.strokePath();
      g.fillStyle(color, 0.68);
      for (let i = 0; i < 5; i++) {
        const t = (i + 1) / 6;
        const x = Phaser.Math.Linear(fromX, toX, t);
        const y =
          Phaser.Math.Linear(fromY, toY, t) - Math.sin(t * Math.PI) * 28;
        g.fillCircle(x, y, 5 - i * 0.55);
      }
    }

    this.agentLayer?.add(g);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.08,
      duration: 680,
      ease: "Sine.easeOut",
      onComplete: () => g.destroy(),
    });
  }

  private spawnActivityGlyph(
    ref: WielderRef,
    kind: WorldActivityKind,
    color: number
  ) {
    if (!this.canCreateGameObjects()) return;
    const x = ref.container.x;
    const y = ref.container.y - 52;
    const g = this.add.graphics().setPosition(x, y).setDepth(70);
    drawActivityGlyph(g, kind, color);
    const label = this.add
      .text(x, y + 16, activityLabel(kind).toUpperCase(), {
        fontSize: "7px",
        color: "#fff8e0",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.72)",
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5)
      .setDepth(71);
    this.agentLayer?.add([g, label]);
    this.tweens.add({
      targets: [g, label],
      y: "-=26",
      alpha: 0,
      scale: 1.15,
      duration: 820,
      ease: "Cubic.easeOut",
      onComplete: () => {
        g.destroy();
        label.destroy();
      },
    });
  }

  private pulseRoutesFromWorld(worldRef: WorldRef, color: number) {
    if (!this.canCreateGameObjects()) return;
    const source = this.layout.get(worldRef.worldId);
    if (!source) return;
    const peers = [...this.worlds.values()]
      .filter((peer) => {
        if (peer.worldId === worldRef.worldId) return false;
        const peerLayout = this.layout.get(peer.worldId);
        return peerLayout?.clusterKey === source.clusterKey;
      })
      .slice(0, 4);
    const g = this.add.graphics().setDepth(-30);
    g.lineStyle(2, color, 0.45);
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(worldRef.container.x, worldRef.container.y);
    g.strokePath();
    for (const peer of peers) {
      g.beginPath();
      g.moveTo(worldRef.container.x, worldRef.container.y);
      g.lineTo(peer.container.x, peer.container.y);
      g.strokePath();
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => g.destroy(),
    });
  }

  /** Speech-bubble bark above a wielder for ~2.5s. Cooldown gated so
   * a burst of events doesn't spam multiple bubbles per wielder. */
  private showBark(ref: WielderRef, line: string) {
    const BARK_COOLDOWN_MS = 1500;
    const BARK_LIFETIME_MS = 2500;
    const now = performance.now();
    if (now - ref.lastBarkAt < BARK_COOLDOWN_MS) return;
    ref.lastBarkAt = now;
    if (ref.barkText) {
      ref.barkText.destroy();
      ref.barkText = undefined;
    }
    const bubble = this.add
      .text(0, -50, line, {
        fontSize: "8px",
        color: "#fff8e0",
        backgroundColor: "rgba(10, 10, 26, 0.92)",
        padding: { x: 6, y: 3 },
        wordWrap: { width: 110 },
        align: "center",
      })
      .setOrigin(0.5, 1)
      .setAlpha(0);
    ref.container.add(bubble);
    ref.barkText = bubble;
    this.tweens.add({
      targets: bubble,
      alpha: { from: 0, to: 1 },
      y: -56,
      duration: 200,
      ease: "Sine.easeOut",
    });
    this.time.delayedCall(BARK_LIFETIME_MS, () => {
      if (!bubble.scene) return;
      this.tweens.add({
        targets: bubble,
        alpha: 0,
        duration: 350,
        onComplete: () => {
          if (bubble.scene) bubble.destroy();
        },
      });
      if (ref.barkText === bubble) ref.barkText = undefined;
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
        for (const wielder of ref.wielders.values()) {
          wielder.tether?.destroy();
          wielder.orderLine.destroy();
          wielder.container.destroy(true);
        }
        ref.container.destroy(true);
        this.worlds.delete(id);
      } else {
        // Existing world might have moved when the cluster set changed
        // (e.g., a sibling repo was added). Reposition smoothly.
        const pos = this.layout.get(id);
        if (pos && (ref.container.x !== pos.x || ref.container.y !== pos.y)) {
          for (const wielder of ref.wielders.values()) {
            wielder.locationTargetKey = undefined;
          }
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
    this.drawWorldRoutes();
    this.drawRealmMap();
    // Auto-fit camera when the world set changes, unless the user has
    // touched the camera recently (manual control wins).
    const shouldAutoFit =
      this.worlds.size !== prevCount &&
      this.worlds.size > 0 &&
      performance.now() - this.lastUserCamMs > 4000;
    if (shouldAutoFit) this.fitCameraToWorlds();
  }

  private drawWorldRoutes() {
    const g = this.routeGfx;
    if (!g) return;
    g.clear();

    const grouped = new Map<string, { id: string; x: number; y: number }[]>();
    for (const [id, layout] of this.layout) {
      const list = grouped.get(layout.clusterKey) ?? [];
      list.push({ id, x: layout.x, y: layout.y });
      grouped.set(layout.clusterKey, list);
    }

    const centroids: { key: string; x: number; y: number }[] = [];
    for (const [key, members] of grouped) {
      if (members.length === 0) continue;
      members.sort((a, b) => a.id.localeCompare(b.id));
      const centroid = members.reduce(
        (acc, member) => ({ x: acc.x + member.x, y: acc.y + member.y }),
        { x: 0, y: 0 }
      );
      centroid.x /= members.length;
      centroid.y /= members.length;
      centroids.push({ key, ...centroid });

      const theme = this.worlds.get(members[0].id)?.theme ?? "citadel";
      const palette = THEME_BIOMES[theme];
      this.strokeRealmLane(g, 0, 0, centroid.x, centroid.y, palette.lane, 0.22);

      if (members.length < 2) continue;
      for (const member of members) {
        const memberTheme = this.worlds.get(member.id)?.theme ?? theme;
        this.strokeRealmLane(
          g,
          centroid.x,
          centroid.y,
          member.x,
          member.y,
          THEME_BIOMES[memberTheme].lane,
          0.26
        );
      }
      for (let i = 0; i < members.length; i++) {
        const a = members[i];
        const b = members[(i + 1) % members.length];
        this.strokeRealmLane(g, a.x, a.y, b.x, b.y, 0x6cc6ff, 0.12, 1.2);
      }
    }

    if (centroids.length < 2) return;
    centroids.sort((a, b) => a.key.localeCompare(b.key));
    for (let i = 0; i < centroids.length - 1; i++) {
      const a = centroids[i];
      const b = centroids[i + 1];
      this.strokeRealmLane(g, a.x, a.y, b.x, b.y, 0xc9a4ff, 0.1, 1);
    }
  }

  private strokeRealmLane(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    alpha: number,
    width = 1.8
  ) {
    g.lineStyle(width + 6, 0x020713, alpha * 0.72);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.strokePath();

    const dist = Math.hypot(x2 - x1, y2 - y1);
    const pips = Phaser.Math.Clamp(Math.floor(dist / 180), 2, 7);
    g.fillStyle(color, alpha * 1.25);
    for (let i = 1; i <= pips; i++) {
      const t = i / (pips + 1);
      g.fillCircle(
        Phaser.Math.Linear(x1, x2, t),
        Phaser.Math.Linear(y1, y2, t),
        2.1
      );
    }
  }

  private drawRouteTraffic(
    worlds: Record<string, WorldState>,
    units: Record<string, UnitState>
  ) {
    const g = this.routeTrafficGfx;
    if (!g) return;
    g.clear();
    if (this.worlds.size === 0) return;

    const zoom = this.cameras.main.zoom;
    const routeAlpha = zoom < 0.52 ? 0.42 : 0.3;
    for (const worldRef of this.worlds.values()) {
      const world = worlds[worldRef.worldId];
      if (!world) continue;
      const read = this.worldReadState(worldRef, world, units);
      const activeCount = world.unitIds.filter((id) => {
        const unit = units[id];
        return (
          unit?.status === "working" ||
          unit?.status === "casting" ||
          unit?.status === "fallen"
        );
      }).length;
      if (
        read.state === "idle" &&
        world.unitIds.length === 0 &&
        world.riftling.length === 0
      ) {
        continue;
      }

      const x2 = worldRef.container.x;
      const y2 = worldRef.container.y;
      const dist = Math.hypot(x2, y2);
      if (dist < BASE_RADIUS * 0.72) continue;
      const ux = x2 / dist;
      const uy = y2 / dist;
      const nx = -uy;
      const ny = ux;
      const start = BASE_RADIUS * 0.48;
      const end = Math.max(start + 1, dist - 112);
      const color = read.color;
      const urgency =
        read.state === "pressure"
          ? 1.45
          : read.state === "hold"
            ? 1.15
            : read.state === "sealed"
              ? 0.62
              : 0.92;
      const laneAlpha =
        read.state === "idle"
          ? 0.08
          : read.state === "sealed"
            ? 0.13
            : routeAlpha + read.intensity * 0.14;

      g.lineStyle(9, 0x020713, laneAlpha * 0.55);
      g.lineBetween(ux * start, uy * start, ux * end, uy * end);
      g.lineStyle(read.state === "pressure" ? 2.6 : 2, color, laneAlpha);
      g.lineBetween(ux * start, uy * start, ux * end, uy * end);

      const packetCount = Phaser.Math.Clamp(
        activeCount + world.riftling.length + (read.state === "hold" ? 2 : 1),
        read.state === "idle" ? 1 : 3,
        7
      );
      for (let i = 0; i < packetCount; i++) {
        const drift = (this.t * 0.09 * urgency + i / packetCount) % 1;
        const t = read.state === "pressure" ? 1 - drift : drift;
        const d = Phaser.Math.Linear(start, end, t);
        const wobble = Math.sin(this.t * 2.7 + i * 1.4) * 5;
        const px = ux * d + nx * wobble;
        const py = uy * d + ny * wobble;
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 5.2 + i);
        const size =
          read.state === "pressure"
            ? 8 + pulse * 2
            : read.state === "sealed"
              ? 4.5 + pulse
              : 6.2 + pulse * 1.8;

        if (read.state === "pressure" || read.state === "hold") {
          this.fillRouteTriangle(g, px, py, ux, uy, nx, ny, size, color);
        } else {
          g.fillStyle(color, 0.48 + pulse * 0.24);
          g.fillCircle(px, py, size * 0.42);
          g.lineStyle(1.1, color, 0.26 + pulse * 0.18);
          g.strokeCircle(px, py, size);
        }
      }

      if (read.state === "pressure") {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 4.2);
        g.lineStyle(1.3, color, 0.18 + pulse * 0.16);
        g.strokeCircle(x2, y2, 112 + pulse * 18);
      }
    }
  }

  private fillRouteTriangle(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    ux: number,
    uy: number,
    nx: number,
    ny: number,
    size: number,
    color: number
  ) {
    g.fillStyle(color, 0.62);
    g.fillTriangle(
      x + ux * size,
      y + uy * size,
      x - ux * size * 0.72 + nx * size * 0.58,
      y - uy * size * 0.72 + ny * size * 0.58,
      x - ux * size * 0.72 - nx * size * 0.58,
      y - uy * size * 0.72 - ny * size * 0.58
    );
    g.lineStyle(1.1, 0xfff4c7, 0.28);
    g.strokeTriangle(
      x + ux * size,
      y + uy * size,
      x - ux * size * 0.72 + nx * size * 0.58,
      y - uy * size * 0.72 + ny * size * 0.58,
      x - ux * size * 0.72 - nx * size * 0.58,
      y - uy * size * 0.72 - ny * size * 0.58
    );
  }

  private drawRealmMap() {
    const g = this.realmGfx;
    if (!g) return;
    g.clear();

    const worldRefs = [...this.worlds.values()];
    const bounds = this.getRealmBounds(worldRefs);
    const w = Math.max(bounds.maxX - bounds.minX + 520, 900);
    const h = Math.max(bounds.maxY - bounds.minY + 420, 620);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    g.lineStyle(18, 0x07182f, 0.13);
    g.strokeEllipse(cx, cy + 24, w * 0.98, h * 0.96);
    g.lineStyle(2, 0x6cc6ff, 0.1);
    g.strokeEllipse(cx, cy + 24, w * 0.94, h * 0.9);
    g.lineStyle(1.2, 0xffd86b, 0.06);
    g.strokeEllipse(cx, cy + 24, w * 0.76, h * 0.72);

    this.drawBaseRealm(g);

    const grouped = new Map<string, WorldRef[]>();
    for (const ref of worldRefs) {
      const key = this.layout.get(ref.worldId)?.clusterKey ?? ref.worldId;
      const list = grouped.get(key) ?? [];
      list.push(ref);
      grouped.set(key, list);
    }

    for (const [clusterKey, refs] of grouped) {
      if (refs.length === 0) continue;
      let groupX = 0;
      let groupY = 0;
      for (const ref of refs) {
        groupX += ref.container.x;
        groupY += ref.container.y;
      }
      groupX /= refs.length;
      groupY /= refs.length;
      const radiusX =
        Math.max(...refs.map((ref) => Math.abs(ref.container.x - groupX))) +
        190;
      const radiusY =
        Math.max(...refs.map((ref) => Math.abs(ref.container.y - groupY))) +
        150;
      this.drawClusterBiome(
        g,
        groupX,
        groupY,
        Math.max(radiusX, 230),
        Math.max(radiusY, 170),
        refs[0].theme,
        clusterKey
      );
    }
  }

  private getRealmBounds(worldRefs: WorldRef[]) {
    let minX = -BASE_RADIUS * 1.05;
    let minY = -BASE_RADIUS * 0.7;
    let maxX = BASE_RADIUS * 1.05;
    let maxY = BASE_RADIUS * 0.78;
    for (const ref of worldRefs) {
      minX = Math.min(minX, ref.container.x - WORLD_REALM_PAD_X);
      minY = Math.min(minY, ref.container.y - WORLD_REALM_PAD_Y);
      maxX = Math.max(maxX, ref.container.x + WORLD_REALM_PAD_X);
      maxY = Math.max(maxY, ref.container.y + WORLD_REALM_PAD_Y);
    }
    return { minX, minY, maxX, maxY };
  }

  private drawBaseRealm(g: Phaser.GameObjects.Graphics) {
    g.fillStyle(0x07101f, 0.78);
    g.fillEllipse(0, 34, BASE_RADIUS * 1.7, BASE_RADIUS * 0.72);
    g.lineStyle(2.4, 0xffd86b, 0.24);
    g.strokeEllipse(0, 34, BASE_RADIUS * 1.48, BASE_RADIUS * 0.6);
    g.lineStyle(1.2, 0x6cc6ff, 0.16);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      g.lineBetween(
        Math.cos(a) * BASE_RADIUS * 0.26,
        34 + Math.sin(a) * BASE_RADIUS * 0.1,
        Math.cos(a) * BASE_RADIUS * 0.66,
        34 + Math.sin(a) * BASE_RADIUS * 0.26
      );
    }
  }

  private drawClusterBiome(
    g: Phaser.GameObjects.Graphics,
    cx: number,
    cy: number,
    radiusX: number,
    radiusY: number,
    theme: WorldTheme,
    clusterKey: string
  ) {
    const palette = THEME_BIOMES[theme];
    g.fillStyle(palette.shadow, 0.55);
    g.fillEllipse(cx, cy + 28, radiusX * 2.12, radiusY * 1.55);
    g.fillStyle(palette.ground, 0.24);
    g.fillEllipse(cx, cy, radiusX * 2, radiusY * 1.4);
    g.lineStyle(2, palette.accent, 0.18);
    g.strokeEllipse(cx, cy, radiusX * 1.96, radiusY * 1.36);
    g.lineStyle(1.2, palette.lane, 0.14);
    g.strokeEllipse(cx, cy, radiusX * 1.46, radiusY * 0.98);

    const seed = Math.abs(hashString(clusterKey));
    for (let i = 0; i < 9; i++) {
      const angle = ((seed >> (i % 12)) % 360) * (Math.PI / 180) + i * 0.7;
      const r = 0.18 + ((seed >> (i + 3)) % 50) / 100;
      const x = cx + Math.cos(angle) * radiusX * r;
      const y = cy + Math.sin(angle) * radiusY * r * 0.7;
      g.fillStyle(palette.accent, 0.08 + (i % 3) * 0.02);
      g.fillEllipse(x, y, 34 + (i % 4) * 12, 10 + (i % 3) * 5);
    }

    if (theme === "tide") {
      g.lineStyle(1.4, palette.accent, 0.2);
      for (let band = 0; band < 4; band++) {
        const yBase = cy + radiusY * (-0.34 + band * 0.2);
        g.beginPath();
        for (let x = cx - radiusX * 0.72; x <= cx + radiusX * 0.72; x += 20) {
          const y = yBase + Math.sin((x + seed) * 0.035 + band) * 8;
          if (x === cx - radiusX * 0.72) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    } else if (theme === "crossroads") {
      g.lineStyle(2, palette.accent, 0.16);
      g.lineBetween(cx - radiusX * 0.66, cy, cx + radiusX * 0.66, cy);
      g.lineBetween(cx, cy - radiusY * 0.42, cx, cy + radiusY * 0.42);
      g.lineStyle(1, palette.lane, 0.12);
      for (let i = -2; i <= 2; i++) {
        g.lineBetween(
          cx - radiusX * 0.5,
          cy + i * 28,
          cx + radiusX * 0.5,
          cy + i * 28
        );
      }
    } else if (theme === "bastion") {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + seed * 0.001;
        const x = cx + Math.cos(a) * radiusX * 0.46;
        const y = cy + Math.sin(a) * radiusY * 0.34;
        g.fillStyle(i % 2 === 0 ? palette.accent : palette.lane, 0.16);
        g.fillTriangle(x, y - 22, x - 10, y + 14, x + 11, y + 10);
      }
    } else if (theme === "dusk") {
      g.lineStyle(1.2, palette.accent, 0.18);
      for (let i = 0; i < 3; i++) {
        g.strokeCircle(cx, cy, 42 + i * 34);
      }
      g.lineStyle(2, palette.lane, 0.14);
      g.lineBetween(cx, cy, cx + radiusX * 0.24, cy - radiusY * 0.22);
      g.lineBetween(cx, cy, cx - radiusX * 0.15, cy + radiusY * 0.3);
    } else if (theme === "lantern") {
      g.lineStyle(1.6, palette.accent, 0.2);
      for (let i = 0; i < 5; i++) {
        const x = cx - radiusX * 0.55 + i * radiusX * 0.28;
        g.beginPath();
        g.moveTo(x, cy + radiusY * 0.36);
        g.lineTo(x + 20, cy + radiusY * 0.12);
        g.lineTo(x - 4, cy - radiusY * 0.12);
        g.strokePath();
      }
    } else {
      g.lineStyle(1.3, palette.accent, 0.18);
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        g.lineBetween(
          cx,
          cy,
          cx + Math.cos(a) * radiusX * 0.55,
          cy + Math.sin(a) * radiusY * 0.35
        );
      }
    }
  }

  /**
   * Maintain a label sprite per cluster, positioned at the cluster's
   * centroid. Labels visible only at zoom-out (zoom < 0.7) per Q40
   * cascading defaults.
   */
  private syncClusterLabels() {
    const clusterKeys = new Set<string>();
    for (const layout of this.layout.values())
      clusterKeys.add(layout.clusterKey);

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
      let cx = 0,
        cy = 0;
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
    const metrics = this.realmCameraMetrics();
    if (!metrics) return;
    const cam = this.cameras.main;
    cam.setZoom(
      Phaser.Math.Clamp(metrics.fitZoom * 1.06, ABSOLUTE_MIN_ZOOM, 1.5)
    );
    cam.centerOn(metrics.centerX, metrics.centerY);
  }

  private cameraSafeInsets() {
    const cam = this.cameras.main;
    return {
      left: Math.min(CAMERA_SAFE_LEFT_PX, cam.width * 0.34),
      right: Math.min(CAMERA_SAFE_RIGHT_PX, cam.width * 0.3),
      top: Math.min(CAMERA_SAFE_TOP_PX, cam.height * 0.18),
      bottom: Math.min(CAMERA_SAFE_BOTTOM_PX, cam.height * 0.32),
    };
  }

  private realmCameraMetrics() {
    if (this.worlds.size === 0) return undefined;
    const { minX, minY, maxX, maxY } = this.getRealmBounds([
      ...this.worlds.values(),
    ]);
    const cam = this.cameras.main;
    if (cam.width <= 0 || cam.height <= 0) return undefined;
    const safe = this.cameraSafeInsets();
    const safeW = Math.max(
      cam.width - safe.left - safe.right,
      cam.width * 0.38
    );
    const safeH = Math.max(
      cam.height - safe.top - safe.bottom,
      cam.height * 0.42
    );
    const w = maxX - minX + CAMERA_WORLD_PAD_X * 2;
    const h = maxY - minY + CAMERA_WORLD_PAD_Y * 2;
    const fitZoom = Math.max(
      0.001,
      Math.min(safeW / Math.max(w, 200), safeH / Math.max(h, 200))
    );
    return {
      centerX: (minX + maxX) / 2 + (safe.right - safe.left) / (2 * fitZoom),
      centerY: (minY + maxY) / 2 + (safe.bottom - safe.top) / (2 * fitZoom),
      fitZoom,
    };
  }

  private strategyMinZoom() {
    const metrics = this.realmCameraMetrics();
    if (!metrics) return 0.35;
    return Phaser.Math.Clamp(
      metrics.fitZoom * STRATEGY_ZOOM_EXTRA_ROOM,
      ABSOLUTE_MIN_ZOOM,
      0.75
    );
  }

  private centerCameraOnRealm() {
    const metrics = this.realmCameraMetrics();
    if (!metrics) return;
    this.cameras.main.centerOn(metrics.centerX, metrics.centerY);
  }

  private enforceStrategyZoomFloor() {
    const cam = this.cameras.main;
    const minZoom = this.strategyMinZoom();
    if (cam.zoom >= minZoom) return;
    cam.setZoom(minZoom);
    this.centerCameraOnRealm();
  }

  private spawnKingdomBase(): BaseRef {
    const container = this.add.container(0, 0).setDepth(-20);
    const isoPlane = this.add.container(0, 0);

    const shadow = this.add
      .ellipse(0, 34, BASE_RADIUS * 1.2, BASE_RADIUS * 0.48, 0x000000, 0.28)
      .setDepth(-25);
    const aura = this.add
      .ellipse(0, 18, BASE_RADIUS * 1.22, BASE_RADIUS * 0.52, 0x2f7dff, 0.1)
      .setBlendMode(Phaser.BlendModes.ADD);
    container.add([shadow, aura]);

    const haveTiles =
      this.textures.exists("tile-iso-a") && this.textures.exists("tile-iso-b");
    if (haveTiles) {
      for (let x = 0; x < BASE_GRID_W; x++) {
        for (let y = 0; y < BASE_GRID_H; y++) {
          const c = this.baseIsoToLocal(x + 0.5, y + 0.5);
          const tex = (x + y) % 2 === 0 ? "tile-iso-a" : "tile-iso-b";
          const tile = this.add.image(c.x, c.y, tex);
          tile.setOrigin(0.5, 0.5);
          tile.setScale(BASE_TILE_W / ISO_TILE_W, BASE_TILE_H / ISO_TILE_H);
          tile.setAlpha(1);
          tile.setTint((x + y) % 2 === 0 ? 0x5f76c8 : 0x405aa6);
          isoPlane.add(tile);
        }
      }
    } else {
      const g = this.add.graphics();
      g.lineStyle(1, 0x334575, 0.42);
      for (let x = 0; x < BASE_GRID_W; x++) {
        for (let y = 0; y < BASE_GRID_H; y++) {
          const a = this.baseIsoToLocal(x, y);
          const b = this.baseIsoToLocal(x + 1, y);
          const c = this.baseIsoToLocal(x + 1, y + 1);
          const d = this.baseIsoToLocal(x, y + 1);
          g.fillStyle((x + y) % 2 === 0 ? 0x101a3e : 0x14204a, 0.96);
          g.fillPoints([a, b, c, d] as Phaser.Math.Vector2[], true);
          g.strokePoints([a, b, c, d, a] as Phaser.Math.Vector2[]);
        }
      }
      isoPlane.add(g);
    }

    const center = this.baseIsoToLocal(BASE_GRID_W / 2, BASE_GRID_H / 2);
    const tex = LANDMARK_TEX("citadel");
    if (this.textures.exists(tex)) {
      const castle = this.add.image(center.x, center.y - 8, tex);
      castle.setOrigin(0.5, 1);
      castle.setScale(2.65);
      castle.setTint(0xfff8db);
      isoPlane.add(castle);
    }

    const beacon = this.add
      .circle(center.x, center.y - 62, 38, 0xffd86b, 0.18)
      .setStrokeStyle(2.5, 0xffd86b, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    isoPlane.add(beacon);

    const commandGfx = this.add.graphics();
    isoPlane.add(commandGfx);

    const padTiles = [
      [1.6, 5.8],
      [3.2, 6.9],
      [6.8, 6.9],
      [8.4, 5.8],
      [2.4, 2.5],
      [7.6, 2.5],
    ] as const;
    const pads = padTiles.map(([tx, ty], i) => {
      const p = this.baseIsoToLocal(tx, ty);
      const pad = this.add
        .circle(p.x, p.y, 20, i % 2 === 0 ? 0x6cc6ff : 0xffd86b, 0.22)
        .setStrokeStyle(2.2, i % 2 === 0 ? 0x6cc6ff : 0xffd86b, 0.72)
        .setScale(1, 0.42);
      isoPlane.add(pad);
      return pad;
    });

    const rim = this.add
      .ellipse(0, 18, BASE_RADIUS * 1.08, BASE_RADIUS * 0.46, 0x000000, 0)
      .setStrokeStyle(2.4, 0x6cc6ff, 0.42);
    isoPlane.add(rim);
    const label = this.add
      .text(0, BASE_RADIUS * 0.32, "KINGDOM BASE", {
        fontSize: "10px",
        color: "#ffd86b",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        letterSpacing: 1,
        backgroundColor: "rgba(6, 8, 18, 0.72)",
        padding: { x: 5, y: 2 },
      })
      .setOrigin(0.5, 0);
    isoPlane.add(label);

    container.add(isoPlane);
    return {
      container,
      isoPlane,
      commandGfx,
      beacon,
      pads,
      phase: Math.random() * Math.PI * 2,
    };
  }

  private tickKingdomBase(delta: number, units: Record<string, UnitState>) {
    const base = this.base;
    if (!base) return;
    base.phase += delta * 0.001;
    const pulse = 0.5 + 0.5 * Math.sin(base.phase * 1.8);
    base.beacon.setScale(0.92 + pulse * 0.18);
    base.beacon.setAlpha(0.55 + pulse * 0.28);
    const activeUnits = Object.values(units).filter(
      (unit) => unit.status === "working" || unit.status === "casting"
    );
    for (let i = 0; i < base.pads.length; i++) {
      const padPulse = 0.5 + 0.5 * Math.sin(base.phase * 2.1 + i * 0.7);
      const active = activeUnits.length > 0 && i < activeUnits.length;
      base.pads[i].setAlpha(
        active ? 0.72 + padPulse * 0.22 : 0.42 + padPulse * 0.26
      );
      base.pads[i].setStrokeStyle(
        active ? 2.8 : 2.2,
        active ? 0xffd86b : i % 2 === 0 ? 0x6cc6ff : 0xffd86b,
        active ? 0.88 : 0.64
      );
    }

    const g = base.commandGfx;
    g.clear();
    const center = this.baseIsoToLocal(BASE_GRID_W / 2, BASE_GRID_H / 2);
    g.lineStyle(1.2, 0x6cc6ff, 0.12 + pulse * 0.08);
    for (let i = 0; i < 3; i++) {
      const ringPulse = (base.phase * 18 + i * 28) % 34;
      g.strokeEllipse(
        center.x,
        center.y - 12,
        86 + i * 46 + ringPulse,
        34 + i * 18 + ringPulse * 0.35
      );
    }

    const pipCount = Phaser.Math.Clamp(activeUnits.length, 0, 8);
    for (let i = 0; i < pipCount; i++) {
      const a = base.phase * 1.15 + (i / Math.max(pipCount, 1)) * Math.PI * 2;
      const rX = 78 + (i % 3) * 18;
      const rY = 28 + (i % 3) * 7;
      g.fillStyle(i % 2 === 0 ? 0xffd86b : 0x6cc6ff, 0.65);
      g.fillCircle(
        center.x + Math.cos(a) * rX,
        center.y - 12 + Math.sin(a) * rY,
        2.6 + pulse * 1.4
      );
    }
  }

  private baseIsoToLocal(tx: number, ty: number) {
    const offsetY = -(BASE_GRID_H * BASE_TILE_H) / 2;
    return {
      x: (tx - ty) * (BASE_TILE_W / 2),
      y: offsetY + (tx + ty) * (BASE_TILE_H / 2),
    };
  }

  private baseSlotPosition(slot: number) {
    const slots = [
      [4.4, 5.5],
      [5.4, 5.5],
      [3.3, 5.2],
      [6.5, 5.2],
      [2.4, 4.3],
      [7.5, 4.3],
      [3.4, 3.2],
      [6.4, 3.2],
      [4.8, 4.2],
      [3.1, 6.5],
      [6.9, 6.5],
      [8.2, 5.2],
    ] as const;
    const normalized = Number.isFinite(slot)
      ? Math.abs(Math.floor(slot)) % slots.length
      : 0;
    const [tx, ty] = slots[normalized];
    const p = this.baseIsoToLocal(tx, ty);
    const h = hashString(String(slot));
    return {
      x: p.x + (((Math.abs(h) >> 2) % 9) - 4) * 1.8,
      y: p.y + (((Math.abs(h) >> 7) % 7) - 3) * 1.4,
    };
  }

  private basePatrolPosition(slot: number) {
    const tx = 2 + Math.random() * 6;
    const ty = 2.4 + Math.random() * 4.2;
    const p = this.baseIsoToLocal(tx, ty);
    const home = this.baseSlotPosition(slot);
    return {
      x: Phaser.Math.Linear(home.x, p.x, 0.72),
      y: Phaser.Math.Linear(home.y, p.y, 0.72),
    };
  }

  private missionSlotPosition(worldRef: WorldRef, slot: number) {
    const radius = this.missionRingRadius();
    const normalized = Number.isFinite(slot)
      ? Math.abs(Math.floor(slot)) % MISSION_PAD_COUNT
      : 0;
    const angle =
      -Math.PI / 2 + normalized * ((Math.PI * 2) / MISSION_PAD_COUNT);
    return {
      x: worldRef.container.x + Math.cos(angle) * radius,
      y: worldRef.container.y + Math.sin(angle) * radius * 0.68,
    };
  }

  private missionRingRadius() {
    return (ISO_GRID * ISO_TILE_W * ISO_CONTAINER_SCALE) / 2 + 52;
  }

  private missionSlotFor(ref: WielderRef) {
    return ref.formationSlot ?? ref.homeIndex;
  }

  private refreshMissionFormation(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>
  ) {
    const activeRefs = world.unitIds
      .map((id) => {
        const unit = units[id];
        const ref = worldRef.wielders.get(id);
        return unit && ref ? { unit, ref } : undefined;
      })
      .filter(
        (entry): entry is { unit: UnitState; ref: WielderRef } =>
          !!entry &&
          (this.shouldStandAtMission(entry.unit, entry.ref) ||
            this.isWielderVisiblyWorking(entry.ref, entry.unit))
      )
      .sort((a, b) => {
        const statusWeight = (unit: UnitState) =>
          unit.status === "fallen"
            ? 0
            : unit.parentSessionId
              ? 1
              : unit.status === "casting"
                ? 2
                : unit.status === "working"
                  ? 3
                  : 4;
        const byStatus = statusWeight(a.unit) - statusWeight(b.unit);
        if (byStatus !== 0) return byStatus;
        return (
          (a.unit.spawnedAt ?? a.unit.lastActivity) -
          (b.unit.spawnedAt ?? b.unit.lastActivity)
        );
      });

    const assigned = new Set<WielderRef>();
    activeRefs.forEach(({ ref }, index) => {
      ref.formationSlot =
        MISSION_FORMATION_ORDER[index % MISSION_FORMATION_ORDER.length];
      assigned.add(ref);
    });

    for (const ref of worldRef.wielders.values()) {
      if (!assigned.has(ref)) {
        ref.formationSlot = undefined;
      }
    }
  }

  private hasMissionStatus(unit: UnitState) {
    return (
      unit.status === "working" ||
      unit.status === "casting" ||
      unit.status === "fallen"
    );
  }

  private shouldStandAtMission(unit: UnitState, ref?: WielderRef) {
    return (
      this.hasMissionStatus(unit) ||
      (ref ? this.time.now < ref.missionHoldUntil : false)
    );
  }

  private holdMissionForEvent(ref: WielderRef, event: AgentEvent) {
    let holdMs = 0;
    if (event.kind === "tool_use" || event.kind === "user_prompt") {
      holdMs = MISSION_DWELL_MS;
    } else if (event.kind === "permission_request") {
      holdMs = PERMISSION_DWELL_MS;
    } else if (event.kind === "subagent_spawn") {
      holdMs = MISSION_DWELL_MS;
    }
    if (holdMs === 0) return;
    ref.missionHoldUntil = Math.max(
      ref.missionHoldUntil,
      this.time.now + holdMs
    );
    ref.locationTargetKey = undefined;
  }

  private locationKeyFor(
    mode: WielderRef["locationMode"],
    worldId: string | undefined
  ) {
    return mode === "mission" && worldId ? `mission:${worldId}` : "base";
  }

  private ensureWielderLocation(
    worldRef: WorldRef,
    ref: WielderRef,
    unit: UnitState,
    now: number
  ) {
    const mode: WielderRef["locationMode"] = this.shouldStandAtMission(
      unit,
      ref
    )
      ? "mission"
      : "base";
    const key = this.locationKeyFor(mode, worldRef.worldId);
    if (ref.locationTargetKey === key) return;

    const target =
      mode === "mission"
        ? this.missionSlotPosition(worldRef, this.missionSlotFor(ref))
        : this.baseSlotPosition(ref.homeIndex);
    ref.locationTargetKey = key;
    ref.locationMode = mode;
    ref.isTraveling = true;
    ref.patrolTarget = undefined;
    ref.patrolState = "walking";
    this.tweens.killTweensOf(ref.container);
    if (unit.status !== "fallen") {
      ref.container.setAngle(0);
      ref.container.setAlpha(1);
    }
    const dist = Math.hypot(
      target.x - ref.container.x,
      target.y - ref.container.y
    );
    const duration = Phaser.Math.Clamp(dist * 4.2, 420, 1900);
    if (dist > 72) {
      const color =
        mode === "mission"
          ? THEME_BIOMES[worldRef.theme].accent
          : THEME_BIOMES[worldRef.theme].lane;
      this.spawnTravelPulse(
        { x: ref.container.x, y: ref.container.y },
        target,
        color,
        duration
      );
    }
    this.playWalkAnimation(ref, unit.role);
    this.tweens.add({
      targets: ref.container,
      x: target.x,
      y: target.y,
      duration,
      ease: "Sine.easeInOut",
      onComplete: () => {
        ref.isTraveling = false;
        ref.patrolState = "arrived";
        ref.patrolNextSwitchAt = now + 900 + Math.random() * 1800;
        if (unit.status !== "fallen") {
          this.playIdleAnimation(ref, unit.role);
        }
      },
    });
  }

  private playWalkAnimation(ref: WielderRef, role: UnitState["role"]) {
    const walkAnim = ANIM.walkDown(role);
    if (
      this.anims.exists(walkAnim) &&
      ref.sprite &&
      ref.currentAnim !== walkAnim
    ) {
      ref.sprite.play(walkAnim);
      ref.currentAnim = walkAnim;
    }
  }

  private playIdleAnimation(ref: WielderRef, role: UnitState["role"]) {
    const idle = getIdleAnimKey(role);
    if (this.anims.exists(idle) && ref.sprite && ref.currentAnim !== idle) {
      ref.sprite.play(idle);
      ref.currentAnim = idle;
    }
  }

  private spawnTravelPulse(
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: number,
    duration: number
  ) {
    const lane = this.add.graphics().setDepth(52);
    lane.lineStyle(7, 0x020713, 0.5);
    lane.beginPath();
    lane.moveTo(from.x, from.y);
    lane.lineTo(to.x, to.y);
    lane.strokePath();
    lane.lineStyle(2.2, color, 0.6);
    lane.beginPath();
    lane.moveTo(from.x, from.y);
    lane.lineTo(to.x, to.y);
    lane.strokePath();

    const markerGlow = this.add.circle(0, 0, 12, color, 0.22);
    const marker = this.add
      .triangle(0, 0, 0, -9, 13, 9, -13, 9, color, 0.9)
      .setStrokeStyle(1, 0xffffff, 0.45);
    const markerContainer = this.add.container(from.x, from.y, [
      markerGlow,
      marker,
    ]);
    markerContainer.setDepth(61);
    markerContainer.setRotation(
      Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y) + Math.PI / 2
    );
    this.agentLayer?.add([lane, markerContainer]);
    this.tweens.add({
      targets: markerContainer,
      x: to.x,
      y: to.y,
      duration,
      ease: "Sine.easeInOut",
      onComplete: () => markerContainer.destroy(true),
    });
    this.tweens.add({
      targets: lane,
      alpha: 0,
      duration: Math.max(360, duration * 0.9),
      ease: "Sine.easeIn",
      onComplete: () => lane.destroy(),
    });
  }

  private spawnWorld(worldId: string, world: WorldState): WorldRef {
    const theme = themeFor(worldId);
    const pos = this.layout.get(worldId) ?? { x: 0, y: 0 };
    const container = this.add.container(pos.x, pos.y);

    // Iso plane container — scaled down to fit cluster spacing. Holds
    // tiles, landmark, atmospherics, and riftling. Wielders live on
    // the scene-global agent layer and stage beside the world.
    const isoPlane = this.add.container(0, 0);
    isoPlane.setScale(ISO_CONTAINER_SCALE);
    this.buildIsoPlane(isoPlane, theme);

    // UI affordances at native scale (don't shrink with the iso plane).
    const ringRadius = (ISO_GRID * ISO_TILE_W * ISO_CONTAINER_SCALE) / 2 + 8;
    const biome = this.add.graphics();
    this.drawWorldBiomeBackdrop(biome, theme, ringRadius);
    const stateGfx = this.add.graphics();
    const workGfx = this.add.graphics();
    const missionPads = this.spawnMissionPads(theme);
    const alertRing = this.add
      .circle(0, 0, ringRadius, 0x000000, 0)
      .setStrokeStyle(2.5, ALERT_RING_COLOR[world.alertLevel], 1);
    const selectionRing = this.add
      .circle(0, 0, ringRadius + 12, 0x000000, 0)
      .setStrokeStyle(2.2, 0xffd86b, 0)
      .setVisible(false);

    const labelY = ringRadius + 6;
    const label = this.add
      .text(0, labelY, world.label, {
        fontSize: "13px",
        color: "#cfd9f0",
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.72)",
        padding: { x: 5, y: 1 },
      })
      .setOrigin(0.5, 0);

    const themeText = this.add
      .text(0, labelY + 18, themeLabel(theme).toUpperCase(), {
        fontSize: "9px",
        color: "#8aa0d0",
        fontFamily: "ui-monospace, monospace",
        letterSpacing: 1,
        backgroundColor: "rgba(6, 8, 18, 0.56)",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5, 0);

    const stateLabelY = -ringRadius - 18;
    const stateLabelBg = this.add
      .rectangle(0, stateLabelY + 7, 76, 18, 0x06101f, 0.86)
      .setStrokeStyle(1, WORLD_STATE_COLORS.idle, 0.45);
    const stateLabel = this.add
      .text(0, stateLabelY, WORLD_STATE_LABELS.idle, {
        fontSize: "9px",
        color: "#dce8ff",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
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

    // Time-of-day / activity overlays follow the world's oval footprint.
    // Rectangular overlays read like a map tile when zoomed out.
    const overlayW = ringRadius * 2.26;
    const overlayH = ringRadius * 1.16;
    const todOverlay = this.add
      .ellipse(0, 10, overlayW, overlayH, 0x000000, 0)
      .setOrigin(0.5);
    const breathOverlay = this.add
      .ellipse(0, 10, overlayW, overlayH, 0x6cc6ff, 0)
      .setOrigin(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    const eventOverlay = this.add
      .ellipse(0, 10, overlayW, overlayH, 0xffd86b, 0)
      .setOrigin(0.5)
      .setBlendMode(Phaser.BlendModes.ADD);

    container.add([
      biome,
      stateGfx,
      workGfx,
      ...missionPads,
      isoPlane,
      todOverlay,
      breathOverlay,
      eventOverlay,
      alertRing,
      selectionRing,
      label,
      themeText,
      stateLabelBg,
      stateLabel,
      countBg,
      countText,
    ]);

    // Click → select world's first wielder + pan camera here.
    // Hit area is the alert ring (covers the world's footprint).
    alertRing.setInteractive({ useHandCursor: true });
    alertRing.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (p.button !== 0 || this.didDrag) return;
      const w = useStore.getState().worlds[worldId];
      const firstUnit = w?.unitIds?.[0];
      if (firstUnit) useStore.getState().selectUnit(firstUnit);
      useStore.getState().selectWorld(worldId);
    });

    // Tier 2 — per-theme signature atmosphere on the iso plane.
    // Drawn into a Graphics that's redrawn each frame from the theme's
    // routine. Themes without a signature treatment leave this undefined.
    let atmospherics: Phaser.GameObjects.Graphics | undefined;
    if (theme === "tide" || theme === "lantern" || theme === "bastion") {
      atmospherics = this.add.graphics();
      atmospherics.setDepth(-12);
      isoPlane.add(atmospherics);
    }

    return {
      worldId,
      container,
      isoPlane,
      biome,
      stateGfx,
      workGfx,
      missionPads,
      todOverlay,
      breathOverlay,
      eventOverlay,
      alertRing,
      selectionRing,
      stateLabelBg,
      stateLabel,
      countText,
      countBg,
      theme,
      alertLevel: world.alertLevel,
      spawnedAt: this.time.now,
      wielders: new Map(),
      riftling: new Map(),
      particles: this.spawnWorldParticles(isoPlane, theme),
      atmospherics,
      atmosPhase: Math.random() * Math.PI * 2,
      breathPhase: Math.random() * Math.PI * 2,
      lastActivityAt: 0,
      lastActivityColor: ALERT_RING_COLOR[world.alertLevel],
      missionPadPhase: Math.random() * Math.PI * 2,
    };
  }

  private drawWorldBiomeBackdrop(
    g: Phaser.GameObjects.Graphics,
    theme: WorldTheme,
    ringRadius: number
  ) {
    const palette = THEME_BIOMES[theme];
    g.clear();
    g.fillStyle(0x000000, 0.34);
    g.fillEllipse(0, 34, ringRadius * 2.52, ringRadius * 1.3);
    g.fillStyle(palette.shadow, 0.86);
    g.fillEllipse(0, 24, ringRadius * 2.42, ringRadius * 1.26);
    g.fillStyle(palette.ground, 0.5);
    g.fillEllipse(0, 10, ringRadius * 2.22, ringRadius * 1.12);
    g.lineStyle(2.4, palette.accent, 0.42);
    g.strokeEllipse(0, 10, ringRadius * 2.06, ringRadius);
    g.lineStyle(1.4, palette.lane, 0.32);
    g.strokeEllipse(0, 10, ringRadius * 1.56, ringRadius * 0.68);

    if (theme === "tide") {
      g.lineStyle(1.2, palette.accent, 0.38);
      for (let i = 0; i < 3; i++) {
        const yBase = 25 + i * 8;
        g.beginPath();
        for (let x = -ringRadius * 0.82; x <= ringRadius * 0.82; x += 12) {
          const y = yBase + Math.sin(x * 0.09 + i) * 3;
          if (x === -ringRadius * 0.82) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    } else if (theme === "crossroads") {
      g.lineStyle(1.5, palette.accent, 0.28);
      g.lineBetween(-ringRadius * 0.7, 8, ringRadius * 0.7, 8);
      g.lineBetween(0, -ringRadius * 0.32, 0, ringRadius * 0.42);
    } else if (theme === "bastion") {
      g.fillStyle(palette.accent, 0.22);
      g.fillTriangle(-42, 4, -28, -28, -12, 8);
      g.fillTriangle(38, 8, 50, -20, 62, 12);
    } else if (theme === "dusk") {
      g.lineStyle(1.2, palette.accent, 0.24);
      g.strokeCircle(0, 2, 44);
      g.strokeCircle(0, 2, 62);
      g.lineBetween(0, 2, 26, -24);
      g.lineBetween(0, 2, -18, 30);
    } else if (theme === "lantern") {
      g.lineStyle(1.4, palette.accent, 0.32);
      g.beginPath();
      g.moveTo(-64, 28);
      g.lineTo(-44, -12);
      g.lineTo(-18, 20);
      g.lineTo(8, -22);
      g.lineTo(44, 22);
      g.strokePath();
    } else {
      g.lineStyle(1.2, palette.accent, 0.22);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.lineBetween(
          Math.cos(a) * 18,
          10 + Math.sin(a) * 8,
          Math.cos(a) * ringRadius * 0.74,
          10 + Math.sin(a) * ringRadius * 0.34
        );
      }
    }
  }

  private spawnMissionPads(theme: WorldTheme) {
    const palette = THEME_BIOMES[theme];
    const radius = this.missionRingRadius();
    const pads: Phaser.GameObjects.Arc[] = [];
    for (let i = 0; i < MISSION_PAD_COUNT; i++) {
      const angle = -Math.PI / 2 + i * ((Math.PI * 2) / MISSION_PAD_COUNT);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius * 0.68;
      const pad = this.add
        .circle(x, y, 16, palette.ground, 0.26)
        .setStrokeStyle(1.9, palette.lane, 0.55)
        .setScale(1, 0.46);
      pads.push(pad);
    }
    return pads;
  }

  private worldReadState(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>
  ): { color: number; intensity: number; state: WorldReadState } {
    const activeCount = world.unitIds.filter((id) => {
      const unit = units[id];
      return unit?.status === "working" || unit?.status === "casting";
    }).length;
    const fallenCount = world.unitIds.filter(
      (id) => units[id]?.status === "fallen"
    ).length;
    const recentKind =
      this.time.now - worldRef.lastActivityAt < ACTIVITY_MOOD_MS
        ? worldRef.lastActivityKind
        : undefined;
    if (world.alertLevel === "cleared") {
      return {
        state: "sealed",
        color: WORLD_STATE_COLORS.sealed,
        intensity: 0.58,
      };
    }
    if (
      world.alertLevel === "danger" ||
      world.riftling.length >= 3 ||
      fallenCount > 0 ||
      recentKind === "error"
    ) {
      return {
        state: "pressure",
        color: WORLD_STATE_COLORS.pressure,
        intensity: Phaser.Math.Clamp(
          0.42 + world.riftling.length * 0.08 + fallenCount * 0.14,
          0.42,
          0.9
        ),
      };
    }
    if (recentKind === "permission" || recentKind === "prompt") {
      return {
        state: "hold",
        color: WORLD_STATE_COLORS.hold,
        intensity: 0.62,
      };
    }
    if (
      world.alertLevel === "warning" ||
      world.riftling.length > 0 ||
      activeCount > 0
    ) {
      return {
        state: activeCount > 0 ? "active" : "pressure",
        color:
          activeCount > 0
            ? WORLD_STATE_COLORS.active
            : WORLD_STATE_COLORS.pressure,
        intensity: Phaser.Math.Clamp(0.34 + activeCount * 0.1, 0.34, 0.7),
      };
    }
    return { state: "idle", color: WORLD_STATE_COLORS.idle, intensity: 0.24 };
  }

  private tickWorldStateLayer(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>
  ) {
    const g = worldRef.stateGfx;
    const read = this.worldReadState(worldRef, world, units);
    const ringRadius = (ISO_GRID * ISO_TILE_W * ISO_CONTAINER_SCALE) / 2 + 8;
    const pulse =
      0.5 + 0.5 * Math.sin(this.t * (read.state === "pressure" ? 4.8 : 2.2));
    const fineAlpha = Math.max(this.fineDetailAlpha(), 0.32);
    g.clear();
    g.setAlpha(fineAlpha);

    worldRef.stateLabel.setText(WORLD_STATE_LABELS[read.state]);
    worldRef.stateLabel.setColor(
      read.state === "pressure" ? "#ffe0d8" : "#fff8e0"
    );
    worldRef.stateLabelBg
      .setFillStyle(0x06101f, read.state === "idle" ? 0.62 : 0.86)
      .setStrokeStyle(1.2, read.color, 0.5 + read.intensity * 0.3);
    worldRef.stateLabelBg.width =
      read.state === "pressure" ? 92 : read.state === "sealed" ? 78 : 72;

    if (read.state === "idle") {
      g.lineStyle(1.1, read.color, 0.08 + pulse * 0.04);
      g.strokeEllipse(0, 12, ringRadius * 1.9, ringRadius * 0.86);
      g.lineStyle(1, THEME_BIOMES[worldRef.theme].lane, 0.08);
      for (let i = -2; i <= 2; i++) {
        g.lineBetween(
          -ringRadius * 0.58,
          10 + i * 13,
          ringRadius * 0.58,
          10 + i * 13
        );
      }
      return;
    }

    if (read.state === "sealed") {
      g.fillStyle(0x7af0c0, 0.06 + pulse * 0.04);
      g.fillEllipse(0, 12, ringRadius * 2.2, ringRadius * 1.02);
      g.lineStyle(2.2, 0xffd86b, 0.28 + pulse * 0.18);
      g.strokeEllipse(0, 10, ringRadius * 2.04, ringRadius * 0.92);
      g.lineStyle(1.3, 0x7af0c0, 0.22 + pulse * 0.12);
      for (let i = 0; i < 6; i++) {
        const a = this.t * 0.8 + i * ((Math.PI * 2) / 6);
        const x = Math.cos(a) * ringRadius * 0.72;
        const y = 10 + Math.sin(a) * ringRadius * 0.28;
        g.fillStyle(i % 2 === 0 ? 0xffd86b : 0x7af0c0, 0.45 + pulse * 0.18);
        g.fillCircle(x, y, 2.2 + pulse * 1.4);
      }
      return;
    }

    if (read.state === "hold") {
      g.fillStyle(read.color, 0.07 + pulse * 0.06);
      g.fillEllipse(0, 12, ringRadius * 2.14, ringRadius * 1.02);
      g.lineStyle(2.4, read.color, 0.38 + pulse * 0.22);
      g.strokeEllipse(0, 10, ringRadius * 1.98, ringRadius * 0.92);
      g.fillStyle(read.color, 0.12 + pulse * 0.08);
      g.fillTriangle(0, -ringRadius * 0.64, 34, -ringRadius * 0.28, 0, 0);
      g.fillTriangle(0, -ringRadius * 0.64, 0, 0, -34, -ringRadius * 0.28);
      g.lineStyle(1.6, read.color, 0.56);
      g.strokeTriangle(0, -ringRadius * 0.64, 34, -ringRadius * 0.28, 0, 0);
      g.strokeTriangle(0, -ringRadius * 0.64, 0, 0, -34, -ringRadius * 0.28);
      return;
    }

    if (read.state === "active") {
      g.fillStyle(read.color, 0.06 + pulse * 0.05);
      g.fillEllipse(0, 12, ringRadius * 2.24, ringRadius * 1.04);
      g.lineStyle(2, read.color, 0.28 + pulse * 0.18);
      g.strokeEllipse(0, 10, ringRadius * 2.06, ringRadius * 0.94);
      g.lineStyle(1.2, THEME_BIOMES[worldRef.theme].lane, 0.24 + pulse * 0.14);
      for (let i = 0; i < 5; i++) {
        const a = this.t * 1.2 + i * ((Math.PI * 2) / 5);
        g.lineBetween(
          Math.cos(a) * ringRadius * 0.32,
          10 + Math.sin(a) * ringRadius * 0.14,
          Math.cos(a) * ringRadius * 0.82,
          10 + Math.sin(a) * ringRadius * 0.36
        );
      }
      return;
    }

    g.fillStyle(read.color, 0.08 + read.intensity * 0.06 + pulse * 0.04);
    g.fillEllipse(0, 14, ringRadius * 2.3, ringRadius * 1.08);
    g.lineStyle(2.6, read.color, 0.36 + pulse * 0.24);
    g.strokeEllipse(0, 10, ringRadius * 2.08, ringRadius * 0.94);
    g.lineStyle(1.5, read.color, 0.24 + pulse * 0.18);
    for (let i = 0; i < 8; i++) {
      const a = this.t * 1.6 + i * ((Math.PI * 2) / 8);
      const x = Math.cos(a) * ringRadius * 0.9;
      const y = 10 + Math.sin(a) * ringRadius * 0.42;
      g.fillTriangle(
        x,
        y - 8,
        x + Math.cos(a + 0.28) * 12,
        y + Math.sin(a + 0.28) * 7,
        x + Math.cos(a - 0.28) * 12,
        y + Math.sin(a - 0.28) * 7
      );
    }
  }

  private tickWorldBiome(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>,
    delta: number
  ) {
    worldRef.missionPadPhase += delta * 0.001;
    const palette = THEME_BIOMES[worldRef.theme];
    const activeSlots = new Set<number>();
    for (const ref of worldRef.wielders.values()) {
      if (
        ref.locationMode === "mission" ||
        this.time.now < ref.missionHoldUntil
      ) {
        activeSlots.add(Math.abs(this.missionSlotFor(ref)) % MISSION_PAD_COUNT);
      }
    }

    const hasWorkingUnit = world.unitIds.some((id) => {
      const unit = units[id];
      return unit?.status === "working" || unit?.status === "casting";
    });
    const mood =
      world.alertLevel === "danger" || world.alertLevel === "warning"
        ? 0.14
        : hasWorkingUnit
          ? 0.1
          : 0.04;
    const biomeWave = 0.5 + 0.5 * Math.sin(worldRef.missionPadPhase * 1.8);
    worldRef.biome.setAlpha(0.78 + mood * biomeWave);

    for (let i = 0; i < worldRef.missionPads.length; i++) {
      const busy = activeSlots.has(i);
      const wave =
        0.5 + 0.5 * Math.sin(worldRef.missionPadPhase * 2.8 + i * 0.65);
      const pad = worldRef.missionPads[i];
      pad.setAlpha(busy ? 0.75 + wave * 0.22 : 0.32 + wave * 0.12);
      pad.setFillStyle(
        busy ? palette.accent : palette.ground,
        busy ? 0.34 : 0.2
      );
      pad.setStrokeStyle(
        busy ? 2.2 : 1.4,
        busy ? palette.accent : palette.lane,
        busy ? 0.78 : 0.42
      );
      const scale = busy ? 1.08 + wave * 0.08 : 1;
      pad.setScale(scale, 0.46 * scale);
    }
  }

  private tickWorldWorkSites(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>
  ) {
    const g = worldRef.workGfx;
    g.clear();
    const activeRefs = [...worldRef.wielders.values()]
      .map((ref) => ({ ref, unit: units[ref.unitId] }))
      .filter(
        (entry): entry is { ref: WielderRef; unit: UnitState } =>
          !!entry.unit &&
          (entry.ref.locationMode === "mission" ||
            this.time.now < entry.ref.missionHoldUntil ||
            entry.unit.status === "working" ||
            entry.unit.status === "casting")
      );
    const danger =
      world.alertLevel === "danger" ||
      world.alertLevel === "warning" ||
      world.riftling.length > 0;
    const fineAlpha = this.fineDetailAlpha();
    if (fineAlpha < 0.08 && !danger) return;
    g.setAlpha(Math.max(fineAlpha, danger ? 0.34 : 0));
    const worldPulse = 0.5 + 0.5 * Math.sin(this.t * (danger ? 4.4 : 2.2));
    if (activeRefs.length > 0) {
      g.lineStyle(1.2, 0xffd86b, 0.16 + worldPulse * 0.08);
      g.strokeEllipse(0, 10, 212 + worldPulse * 16, 104 + worldPulse * 8);
    }

    for (const { ref, unit } of activeRefs.slice(0, MISSION_PAD_COUNT)) {
      const p = this.missionSlotPosition(worldRef, this.missionSlotFor(ref));
      const x = p.x - worldRef.container.x;
      const y = p.y - worldRef.container.y;
      const kind = this.unitActivityKind(unit);
      const color = this.commandColorForUnit(worldRef, unit);
      const slotPulse = 0.5 + 0.5 * Math.sin(this.t * 5.2 + ref.homeIndex);
      g.lineStyle(6, 0x020713, 0.36);
      g.lineBetween(x, y, 0, 6);
      g.lineStyle(1.8, color, 0.42 + slotPulse * 0.24);
      g.lineBetween(x, y, 0, 6);
      g.fillStyle(color, 0.1 + slotPulse * 0.12);
      g.fillEllipse(x, y + 4, 48 + slotPulse * 10, 18 + slotPulse * 4);
      g.lineStyle(2, color, 0.5 + slotPulse * 0.28);
      g.beginPath();
      g.arc(
        x,
        y,
        19 + slotPulse * 3,
        -Math.PI / 2,
        -Math.PI / 2 +
          Math.PI * 2 * ((this.t * 0.18 + ref.homeIndex * 0.13) % 1)
      );
      g.strokePath();
      g.fillStyle(color, 0.72);
      g.fillCircle(
        Phaser.Math.Linear(x, 0, 0.5 + slotPulse * 0.16),
        Phaser.Math.Linear(y, 6, 0.5 + slotPulse * 0.16),
        2.2
      );
      if (fineAlpha > 0.18) {
        this.drawWorldJobSite(
          g,
          kind,
          x,
          y,
          color,
          slotPulse,
          this.t + ref.homeIndex * 0.31
        );
      }
    }

    if (danger) {
      g.lineStyle(1.4, 0xff5a3c, 0.16 + worldPulse * 0.18);
      g.strokeEllipse(0, 12, 236 + worldPulse * 22, 116 + worldPulse * 10);
      for (let i = 0; i < Math.min(world.riftling.length, 5); i++) {
        const a = this.t * 1.4 + i * ((Math.PI * 2) / 5);
        g.fillStyle(0xff5a3c, 0.3 + worldPulse * 0.2);
        g.fillTriangle(
          Math.cos(a) * 112,
          10 + Math.sin(a) * 50 - 7,
          Math.cos(a + 0.08) * 112,
          10 + Math.sin(a + 0.08) * 50 + 7,
          Math.cos(a - 0.08) * 112,
          10 + Math.sin(a - 0.08) * 50 + 7
        );
      }
    }
  }

  /**
   * Tier 2 — redraw the per-theme animated atmosphere for one world.
   * Cheap (single Graphics, simple primitives, only runs for themes
   * that have an atmospherics layer).
   */
  private tickWorldAtmospherics(worldRef: WorldRef, delta: number) {
    const g = worldRef.atmospherics;
    if (!g) return;
    worldRef.atmosPhase += delta * 0.001;
    g.clear();
    const halfW = (ISO_GRID * ISO_TILE_W) / 2;
    const halfH = (ISO_GRID * ISO_TILE_H) / 2;
    const phase = worldRef.atmosPhase;
    if (worldRef.theme === "tide") {
      // Water — three sine wave ribbons drifting along the bottom edge.
      // Cyan, low alpha. Period staggered between ribbons so they don't
      // pulse in lockstep.
      g.lineStyle(1.5, 0x6cc6ff, 0.4);
      for (let band = 0; band < 3; band++) {
        const yBase = halfH * 0.55 + band * 6;
        const amp = 3 + band * 1.5;
        const freq = 0.045 + band * 0.005;
        const drift = phase * (1 + band * 0.3);
        g.beginPath();
        for (let x = -halfW; x <= halfW; x += 6) {
          const y = yBase + Math.sin(x * freq + drift) * amp;
          if (x === -halfW) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.strokePath();
      }
    } else if (worldRef.theme === "lantern") {
      // Fire — two flickering ember pools at the landmark base, plus a
      // jittery glow ring.
      const flick1 = 0.7 + 0.3 * Math.sin(phase * 6);
      const flick2 = 0.6 + 0.4 * Math.sin(phase * 7.3 + 1.7);
      g.fillStyle(0xff7a4a, 0.45 * flick1);
      g.fillCircle(-18, halfH * 0.25, 5 + flick1 * 1.5);
      g.fillStyle(0xffb86c, 0.55 * flick1);
      g.fillCircle(-18, halfH * 0.25 - 1, 2.5);
      g.fillStyle(0xff7a4a, 0.45 * flick2);
      g.fillCircle(20, halfH * 0.25, 5 + flick2 * 1.5);
      g.fillStyle(0xffb86c, 0.55 * flick2);
      g.fillCircle(20, halfH * 0.25 - 1, 2.5);
      // Heat shimmer outline around landmark.
      g.lineStyle(1, 0xff5a3c, 0.18 + 0.12 * Math.sin(phase * 4));
      g.strokeCircle(0, 0, 32 + 2 * Math.sin(phase * 5));
    } else if (worldRef.theme === "bastion") {
      // Magic energy — two counter-rotating arcs above the landmark.
      const radius = 30;
      const cy = -8;
      g.lineStyle(2, 0xc9a4ff, 0.55);
      const start1 = phase * 1.4;
      g.beginPath();
      g.arc(0, cy, radius, start1, start1 + Math.PI * 0.7);
      g.strokePath();
      g.lineStyle(2, 0xb88cff, 0.4);
      const start2 = -phase * 1.1 + Math.PI;
      g.beginPath();
      g.arc(0, cy, radius * 0.75, start2, start2 + Math.PI * 0.6);
      g.strokePath();
      // Center spark — pulses in/out.
      const spark = 0.6 + 0.4 * Math.sin(phase * 3);
      g.fillStyle(0xe6d8ff, 0.6 * spark);
      g.fillCircle(0, cy, 2 + spark * 1.5);
    }
  }

  private updateWorldBreath(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>
  ) {
    const activeUnits = world.unitIds
      .map((id) => units[id])
      .filter(
        (unit): unit is UnitState =>
          !!unit && (unit.status === "working" || unit.status === "casting")
      );
    const recentMood =
      this.time.now - worldRef.lastActivityAt < ACTIVITY_MOOD_MS;
    const color = recentMood
      ? worldRef.lastActivityColor
      : ALERT_RING_COLOR[world.alertLevel];

    const alertAlpha =
      world.alertLevel === "danger"
        ? 0.16
        : world.alertLevel === "warning"
          ? 0.11
          : world.alertLevel === "active"
            ? 0.08
            : world.alertLevel === "cleared"
              ? 0.07
              : 0.025;
    const workAlpha = activeUnits.length > 0 ? 0.06 : 0;
    const moodAlpha = recentMood
      ? worldRef.lastActivityKind === "permission" ||
        worldRef.lastActivityKind === "prompt"
        ? 0.14
        : worldRef.lastActivityKind === "error"
          ? 0.16
          : 0.09
      : 0;
    const speed =
      world.alertLevel === "danger"
        ? 5.4
        : activeUnits.length > 0
          ? 4.2
          : recentMood
            ? 3
            : 1.2;
    const wave = 0.5 + 0.5 * Math.sin(this.t * speed + worldRef.breathPhase);
    const alpha = alertAlpha + workAlpha + moodAlpha * wave + 0.02 * wave;
    worldRef.breathOverlay.setFillStyle(
      color,
      Phaser.Math.Clamp(alpha, 0, 0.22)
    );
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
    const halfH = ISO_GRID * ISO_TILE_H;
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
   * Wielders are scene-global actors: idle/complete units roam the base,
   * active/fallen units stand at mission pads beside their world.
   */
  private syncWieldersFor(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>,
    delta: number
  ) {
    const seen = new Set(world.unitIds);
    // Remove gone
    for (const [id, w] of worldRef.wielders) {
      if (!seen.has(id)) {
        w.tether?.destroy();
        w.orderLine.destroy();
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
    this.refreshMissionFormation(worldRef, world, units);
    // Per-frame state update for everyone (HP/MP/aura/patrol/status/tether)
    for (const [id, ref] of worldRef.wielders) {
      const unit = units[id];
      if (!unit) continue;
      this.updateWielder(worldRef, ref, unit, delta);
    }
  }

  /**
   * Per-frame visual update for a wielder. Handles:
   * - HP/MP ring fill
   * - Aura visibility + activation flash
   * - Status pose (death tilt, victory pulse)
   * - Patrol step (walk toward target tile, idle, pick new)
   * - Subagent tether to parent
   */
  private updateWielder(
    worldRef: WorldRef,
    ref: WielderRef,
    unit: UnitState,
    delta: number
  ) {
    const now = this.time.now;
    ref.jobPhase += delta * 0.001;
    ref.idleQuirkPhase += delta * 0.001;

    // ── HP / MP bars ────────────────────────────────────────────────
    // FF14 nameplate look — scale the fill rectangle horizontally by
    // hp/mp fraction. Origin (0, 0.5) on fills means scaling shrinks
    // from the right edge, so the bar drains rightward as expected.
    const hpFrac = Math.max(0, Math.min(1, unit.hp / 100));
    const mpFrac = Math.max(0, Math.min(1, unit.mp / 100));
    ref.hpBarFill.scaleX = hpFrac;
    ref.mpBarFill.scaleX = mpFrac;
    // Critical HP — flash the HP fill red, pulse alpha, swap the bar
    // track border to red, and surface the bobbing "!" alert above
    // the wielder. Multi-modal so it's hard to miss.
    const isCritical = unit.hp > 0 && unit.hp < 25;
    if (isCritical) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.012);
      ref.hpBarFill.setFillStyle(0xff5a3c);
      ref.hpBarFill.setAlpha(0.7 + 0.3 * pulse);
      ref.hpBarBg.setStrokeStyle(1, 0xff5a3c, 0.85);
      ref.criticalAlert.setVisible(true);
      ref.criticalAlert.setAlpha(0.7 + 0.3 * pulse);
      // Gentle bob — 4px sine over ~1.4s.
      ref.criticalAlert.y = -42 + Math.sin(now * 0.005) * 3;
    } else {
      ref.hpBarFill.setFillStyle(0x3da85f);
      ref.hpBarFill.setAlpha(1);
      ref.hpBarBg.setStrokeStyle(1, 0x000000, 0.9);
      ref.criticalAlert.setVisible(false);
    }

    // ── Warden aura ─────────────────────────────────────────────────
    if (unit.auraState !== ref.lastWardenAura) {
      if (unit.auraState) {
        const color = AURA_COLORS[unit.auraState];
        ref.auraRing.setVisible(true).setStrokeStyle(3, color, 1).setScale(0.4);
        // Activation flash: scale up + fade in.
        this.tweens.add({
          targets: ref.auraRing,
          scale: 1,
          duration: 280,
          ease: "Back.easeOut",
        });
        // Persistent glow pulse while active.
        this.tweens.add({
          targets: ref.auraRing,
          alpha: { from: 0.95, to: 0.45 },
          yoyo: true,
          repeat: -1,
          duration: 800,
        });
      } else {
        // Aura ended — fade ring out.
        this.tweens.killTweensOf(ref.auraRing);
        this.tweens.add({
          targets: ref.auraRing,
          alpha: 0,
          duration: 220,
          onComplete: () => ref.auraRing.setVisible(false),
        });
      }
      ref.lastWardenAura = unit.auraState;
    }

    if (this.hasMissionStatus(unit)) {
      ref.missionHoldUntil = Math.max(
        ref.missionHoldUntil,
        now + MISSION_DWELL_MS
      );
    }
    this.ensureWielderLocation(worldRef, ref, unit, now);
    this.updateWielderOrder(worldRef, ref, unit);
    this.updateWielderJobChoreography(worldRef, ref, unit);
    this.updateWielderIdleQuirk(ref, unit);
    this.updateWielderResultPose(worldRef, ref, unit);

    // ── Status pose (death / victory) ───────────────────────────────
    if (unit.status !== ref.lastStatus) {
      if (unit.status === "fallen") {
        // Tilt + fade slightly. Movement is already owned by the
        // base/mission location tween, so only animate pose properties.
        ref.isTraveling = false;
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
      } else if (ref.lastStatus === "fallen" || ref.lastStatus === "complete") {
        // Recovered (rare — typically fixtures only).
        ref.container.setAngle(0);
        ref.container.setAlpha(1);
        ref.sprite?.clearTint();
        ref.label.setColor("#e6ecff");
      }
      ref.lastStatus = unit.status;
    }

    // ── Patrol behavior ─────────────────────────────────────────────
    // Stop patrolling if not in a "free" status. Idle/moving wielders
    // roam the base; working/casting/fallen/complete units stay staged.
    const canPatrol =
      (unit.status === "idle" || unit.status === "moving") &&
      ref.locationMode === "base" &&
      !ref.isTraveling;
    if (canPatrol && now >= ref.patrolNextSwitchAt) {
      const target = this.basePatrolPosition(ref.homeIndex);
      ref.patrolTarget = target;
      ref.patrolState = "walking";
      this.tweens.killTweensOf(ref.container);
      // Ensure no stale rotation/alpha from a fallen→recovered transition
      ref.container.setAngle(0);
      ref.container.setAlpha(1);
      const dist = Math.hypot(
        target.x - ref.container.x,
        target.y - ref.container.y
      );
      const duration = Math.max(900, dist * 9);
      this.playWalkAnimation(ref, unit.role);
      this.tweens.add({
        targets: ref.container,
        x: target.x,
        y: target.y,
        duration,
        ease: "Sine.easeInOut",
        onComplete: () => {
          ref.patrolState = "arrived";
          ref.patrolNextSwitchAt = now + 1200 + Math.random() * 2400;
          this.playIdleAnimation(ref, unit.role);
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
          this.agentLayer?.add(ref.tether);
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
        childCount === 1
          ? "✦ Pair"
          : childCount === 2
            ? "✦ Royal Guard"
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

  private updateWielderJobChoreography(
    worldRef: WorldRef,
    ref: WielderRef,
    unit: UnitState
  ) {
    const active = this.isWielderVisiblyWorking(ref, unit);
    const g = ref.jobGfx;
    g.clear();
    g.setVisible(active);

    if (!active) {
      ref.body.setPosition(0, 0);
      ref.body.setAngle(0);
      ref.body.setScale(1);
      return;
    }

    const fineAlpha = this.fineDetailAlpha();
    if (fineAlpha < 0.08) {
      g.setVisible(false);
      return;
    }
    g.setAlpha(fineAlpha);

    const kind = this.unitActivityKind(unit);
    const color = this.commandColorForUnit(worldRef, unit);
    const phase = ref.jobPhase + ref.homeIndex * 0.41;
    const wave = 0.5 + 0.5 * Math.sin(phase * 2.6);

    ref.body.setScale(1);
    if (kind === "shell") {
      ref.body.setPosition(Math.sin(phase * 9) * 0.8, wave * -1.5);
      ref.body.setAngle(Math.sin(phase * 7) * 2.2);
    } else if (kind === "edit") {
      ref.body.setPosition(Math.sin(phase * 6) * 1.4, 0);
      ref.body.setAngle(Math.sin(phase * 6) * 4.5);
    } else if (kind === "search" || kind === "read") {
      ref.body.setPosition(
        Math.sin(phase * 2.2) * 1.6,
        Math.cos(phase * 2) * 0.6
      );
      ref.body.setAngle(Math.sin(phase * 2.2) * 3);
    } else if (kind === "web" || kind === "subagent") {
      ref.body.setPosition(0, -wave * 2);
      ref.body.setAngle(Math.sin(phase * 2.8) * 2.5);
    } else if (kind === "permission" || kind === "prompt") {
      ref.body.setPosition(0, Math.sin(phase * 3.4) * 0.9);
      ref.body.setAngle(0);
    } else if (kind === "success") {
      ref.body.setPosition(0, -wave * 2.4);
      ref.body.setAngle(Math.sin(phase * 3) * 2);
    } else {
      ref.body.setPosition(0, 0);
      ref.body.setAngle(kind === "error" ? -4 + wave * 8 : 0);
    }

    this.drawLocalJobGlyph(g, kind, color, phase);
  }

  private updateWielderIdleQuirk(ref: WielderRef, unit: UnitState) {
    const g = ref.idleGfx;
    g.clear();
    const fineAlpha = this.fineDetailAlpha();
    const canIdleQuirk =
      (unit.status === "idle" || unit.status === "moving") &&
      ref.locationMode === "base" &&
      ref.patrolState !== "walking" &&
      !ref.isTraveling;

    if (!canIdleQuirk || fineAlpha < 0.08) {
      g.setVisible(false);
      return;
    }

    const now = this.time.now;
    if (now >= ref.idleQuirkNextAt && now >= ref.idleQuirkUntil) {
      ref.idleQuirkUntil = now + IDLE_QUIRK_DURATION_MS;
      ref.idleQuirkNextAt =
        ref.idleQuirkUntil +
        IDLE_QUIRK_MIN_MS +
        Math.random() * (IDLE_QUIRK_MAX_MS - IDLE_QUIRK_MIN_MS);
    }

    if (now >= ref.idleQuirkUntil) {
      g.setVisible(false);
      return;
    }

    const phase = ref.idleQuirkPhase + ref.homeIndex * 0.33;
    const color = ROLE_PALETTE[ref.role].color;
    g.setVisible(true).setAlpha(fineAlpha);
    this.drawIdleQuirk(g, ref.idleQuirkKind, color, phase);

    const bob = Math.sin(phase * 2.6);
    if (ref.idleQuirkKind === "watch") {
      ref.body.setPosition(0, -0.5 + bob * 0.7);
      ref.body.setAngle(bob * 1.8);
    } else if (ref.idleQuirkKind === "garden") {
      ref.body.setPosition(Math.sin(phase * 2.1) * 0.8, 0);
      ref.body.setAngle(Math.sin(phase * 3.4) * 2.6);
    } else if (ref.idleQuirkKind === "forge") {
      ref.body.setPosition(Math.sin(phase * 8) * 0.45, 0);
      ref.body.setAngle(Math.sin(phase * 8) * 2.2);
    } else {
      ref.body.setPosition(Math.sin(phase * 1.7) * 1.1, bob * 0.8);
      ref.body.setAngle(Math.sin(phase * 1.4) * 2);
    }
  }

  private updateWielderResultPose(
    worldRef: WorldRef,
    ref: WielderRef,
    unit: UnitState
  ) {
    const g = ref.streakGfx;
    g.clear();
    const fineAlpha = this.fineDetailAlpha();
    if (
      !ref.streakPoseKind ||
      this.time.now >= ref.streakPoseUntil ||
      fineAlpha < 0.08
    ) {
      g.setVisible(false);
      if (this.time.now >= ref.streakPoseUntil) {
        ref.streakPoseKind = undefined;
      }
      return;
    }

    const color =
      ref.streakPoseKind === "success"
        ? activityColorForTheme(worldRef.theme, "success")
        : activityColorForTheme(worldRef.theme, "error");
    const age =
      1 - (ref.streakPoseUntil - this.time.now) / RESULT_STREAK_POSE_MS;
    const phase = ref.jobPhase + age * Math.PI * 2;
    const pulse = 0.5 + 0.5 * Math.sin(phase * 4);
    g.setVisible(true).setAlpha(fineAlpha);

    if (ref.streakPoseKind === "success") {
      g.fillStyle(color, 0.12 + pulse * 0.08);
      g.fillCircle(0, -18, 18 + pulse * 4);
      g.lineStyle(2.4, color, 0.86);
      g.beginPath();
      g.moveTo(-11, -18);
      g.lineTo(-3, -9);
      g.lineTo(13, -27);
      g.strokePath();
      g.lineStyle(1.2, color, 0.46);
      g.strokeEllipse(0, 8, 50 + pulse * 9, 18 + pulse * 3);
      if (unit.status !== "fallen") {
        ref.body.setPosition(0, -2 - pulse * 2);
        ref.body.setAngle(Math.sin(phase * 3) * 2.4);
      }
    } else {
      const shake = Math.sin(phase * 16);
      g.fillStyle(color, 0.1 + pulse * 0.08);
      g.fillTriangle(-18, -5, 0, -34, 18, -5);
      g.lineStyle(2.2, color, 0.88);
      g.lineBetween(0, -27, 0, -15);
      g.fillCircle(0, -9, 2.2);
      g.lineStyle(1.2, color, 0.52);
      g.strokeEllipse(0, 8, 48 + pulse * 10, 16 + pulse * 3);
      if (unit.status !== "fallen") {
        ref.body.setPosition(shake * 1.8, 0);
        ref.body.setAngle(shake * 4.5);
      }
    }
  }

  private drawIdleQuirk(
    g: Phaser.GameObjects.Graphics,
    kind: IdleQuirkKind,
    color: number,
    phase: number
  ) {
    const pulse = 0.5 + 0.5 * Math.sin(phase * 2.8);
    g.lineStyle(1.1, color, 0.28 + pulse * 0.12);
    g.strokeEllipse(0, 8, 36 + pulse * 4, 13 + pulse * 2);

    if (kind === "watch") {
      g.lineStyle(1.3, color, 0.68);
      g.lineBetween(-20, -23, 20, -29);
      g.strokeCircle(22, -30, 4);
      g.fillStyle(0xffd86b, 0.68 + pulse * 0.2);
      for (let i = 0; i < 3; i++) {
        const a = phase + i * 2.1;
        g.fillCircle(-5 + Math.cos(a) * 18, -35 + Math.sin(a) * 8, 1.8);
      }
    } else if (kind === "garden") {
      g.lineStyle(1.3, color, 0.62);
      g.beginPath();
      g.moveTo(-6, 7);
      g.lineTo(-5, -9);
      g.moveTo(7, 7);
      g.lineTo(8, -11);
      g.strokePath();
      for (let i = 0; i < 5; i++) {
        const a = phase * 1.4 + i * ((Math.PI * 2) / 5);
        g.fillStyle(i % 2 === 0 ? color : 0xffd6ee, 0.56 + pulse * 0.18);
        g.fillCircle(Math.cos(a) * 15, -16 + Math.sin(a) * 9, 2.2);
      }
    } else if (kind === "forge") {
      const slash = Math.sin(phase * 8) * 4;
      g.lineStyle(2.2, color, 0.76);
      g.lineBetween(-20, -7 + slash, 18, -21 - slash);
      g.lineStyle(1.2, 0xfff4c7, 0.72);
      for (let i = 0; i < 4; i++) {
        const a = phase * 5 + i * 1.4;
        g.fillStyle(0xfff4c7, 0.62);
        g.fillCircle(13 + Math.cos(a) * 7, -20 + Math.sin(a) * 5, 1.6);
      }
    } else {
      g.lineStyle(1.4, color, 0.6);
      for (let i = 0; i < 3; i++) {
        const y = -12 + i * 5;
        g.beginPath();
        for (let x = -22; x <= 22; x += 7) {
          const yy = y + Math.sin(phase * 2 + x * 0.22 + i) * 2.5;
          if (x === -22) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.strokePath();
      }
      g.fillStyle(0xffffff, 0.48 + pulse * 0.22);
      g.fillCircle(-16 + ((phase * 9) % 32), -20 + pulse * 4, 1.9);
    }
  }

  private isWielderVisiblyWorking(ref: WielderRef, unit: UnitState) {
    if (ref.isTraveling) return false;
    if (
      unit.status === "working" ||
      unit.status === "casting" ||
      unit.status === "fallen" ||
      unit.status === "complete"
    ) {
      return true;
    }
    return (
      ref.locationMode === "mission" && this.time.now < ref.missionHoldUntil
    );
  }

  private unitActivityKind(unit: UnitState): WorldActivityKind {
    if (unit.status === "fallen") return "error";
    if (unit.status === "complete") return "success";
    if (unit.lastTool) return activityForToolName(unit.lastTool);
    if (unit.parentSessionId && unit.status !== "idle") return "subagent";
    if (unit.status === "casting") return "shell";
    if (unit.status === "working") return "generic";
    return "generic";
  }

  private drawLocalJobGlyph(
    g: Phaser.GameObjects.Graphics,
    kind: WorldActivityKind,
    color: number,
    phase: number
  ) {
    const pulse = 0.5 + 0.5 * Math.sin(phase * 3.2);
    const spin = phase * 1.6;
    g.lineStyle(1.3, 0x020713, 0.55);
    g.strokeEllipse(0, 8, 44 + pulse * 5, 16 + pulse * 3);
    g.lineStyle(1.2, color, 0.3 + pulse * 0.18);
    g.strokeEllipse(0, 8, 40 + pulse * 5, 14 + pulse * 3);

    if (kind === "shell") {
      g.fillStyle(0x020713, 0.58);
      g.fillRect(-20, -25, 40, 15);
      g.lineStyle(1.2, color, 0.82);
      g.strokeRect(-20, -25, 40, 15);
      for (let i = 0; i < 4; i++) {
        const y = -22 + i * 3;
        const w = 8 + ((phase * 10 + i * 5) % 18);
        g.lineBetween(-16, y, -16 + w, y);
      }
      g.fillStyle(color, 0.75);
      g.fillCircle(15, -18 + pulse * 4, 1.8);
    } else if (kind === "read") {
      g.fillStyle(color, 0.12);
      g.fillTriangle(0, -16, -28, 5, 28, 5);
      g.lineStyle(1.2, color, 0.72);
      g.strokeTriangle(0, -16, -28, 5, 28, 5);
      g.fillStyle(0x020713, 0.58);
      g.fillRect(-10, -27, 20, 18);
      g.lineStyle(1, color, 0.86);
      g.strokeRect(-10, -27, 20, 18);
      for (let i = 0; i < 3; i++) {
        g.lineBetween(-6, -22 + i * 5, 6, -22 + i * 5);
      }
    } else if (kind === "edit") {
      const slash = Math.sin(phase * 7) * 5;
      g.lineStyle(4, 0x020713, 0.45);
      g.lineBetween(-23, -6 + slash, 24, -25 - slash);
      g.lineStyle(2.2, color, 0.9);
      g.lineBetween(-23, -6 + slash, 24, -25 - slash);
      g.fillStyle(0xfff4c7, 0.78);
      g.fillCircle(21, -22 - slash, 2.4);
      g.fillCircle(-13, -2 + slash, 1.8);
    } else if (kind === "search") {
      const sx = Math.cos(spin) * 16;
      const sy = -10 + Math.sin(spin) * 9;
      g.lineStyle(1.4, color, 0.58);
      g.strokeCircle(0, -12, 14 + pulse * 4);
      g.fillStyle(color, 0.12);
      g.fillTriangle(0, -12, sx, sy, sx * 0.45, sy + 16);
      g.lineStyle(2, color, 0.86);
      g.strokeCircle(sx * 0.45, sy * 0.45 - 6, 5);
      g.lineBetween(
        sx * 0.45 + 4,
        sy * 0.45 - 2,
        sx * 0.45 + 10,
        sy * 0.45 + 5
      );
    } else if (kind === "web") {
      for (let i = 0; i < 3; i++) {
        g.lineStyle(1.2, color, 0.34 + i * 0.14);
        g.strokeEllipse(0, -13, 20 + i * 10 + pulse * 5, 9 + i * 5);
      }
      g.lineStyle(1.1, color, 0.58);
      g.lineBetween(-20, -13, 20, -13);
      g.lineBetween(0, -27, 0, 1);
    } else if (kind === "permission" || kind === "prompt") {
      g.fillStyle(color, 0.13 + pulse * 0.08);
      g.fillTriangle(0, -31, 21, -17, 0, -4);
      g.fillTriangle(0, -31, 0, -4, -21, -17);
      g.lineStyle(1.8, color, 0.82);
      g.strokeTriangle(0, -31, 21, -17, 0, -4);
      g.strokeTriangle(0, -31, 0, -4, -21, -17);
      g.lineStyle(2.4, color, 0.88);
      if (kind === "permission") {
        g.lineBetween(-5, -20, -5, -11);
        g.lineBetween(5, -20, 5, -11);
      } else {
        g.lineBetween(-6, -20, 0, -17);
        g.lineBetween(0, -17, -6, -14);
        g.lineBetween(3, -12, 9, -12);
      }
    } else if (kind === "error") {
      g.lineStyle(2.4, color, 0.92);
      g.beginPath();
      g.moveTo(-12, -29);
      g.lineTo(-4, -21);
      g.lineTo(-8, -13);
      g.lineTo(3, -4);
      g.lineTo(8, -15);
      g.lineTo(16, -8);
      g.strokePath();
      g.fillStyle(color, 0.16 + pulse * 0.08);
      g.fillTriangle(-18, -6, 0, -33, 18, -6);
    } else if (kind === "success") {
      g.fillStyle(color, 0.12 + pulse * 0.1);
      g.fillCircle(0, -16, 16 + pulse * 4);
      g.lineStyle(2.5, color, 0.92);
      g.beginPath();
      g.moveTo(-10, -16);
      g.lineTo(-3, -8);
      g.lineTo(13, -25);
      g.strokePath();
    } else if (kind === "subagent") {
      g.lineStyle(1.3, color, 0.48);
      g.strokeCircle(0, -15, 18);
      g.fillStyle(color, 0.82);
      for (let i = 0; i < 3; i++) {
        const a = spin + i * ((Math.PI * 2) / 3);
        g.fillCircle(Math.cos(a) * 18, -15 + Math.sin(a) * 10, 2.4);
      }
    } else {
      g.lineStyle(1.4, color, 0.65);
      g.strokeCircle(0, -14, 13 + pulse * 4);
      g.lineBetween(0, -32, 0, 4);
      g.lineBetween(-17, -14, 17, -14);
    }
  }

  private drawWorldJobSite(
    g: Phaser.GameObjects.Graphics,
    kind: WorldActivityKind,
    x: number,
    y: number,
    color: number,
    pulse: number,
    phase: number
  ) {
    const alpha = 0.38 + pulse * 0.24;
    if (kind === "shell") {
      g.fillStyle(0x020713, 0.42);
      g.fillRect(x - 24, y - 24, 48, 19);
      g.lineStyle(1.2, color, alpha);
      g.strokeRect(x - 24, y - 24, 48, 19);
      for (let i = 0; i < 4; i++) {
        const rowY = y - 20 + i * 4;
        const rowW = 10 + ((phase * 10 + i * 6) % 24);
        g.lineBetween(x - 18, rowY, x - 18 + rowW, rowY);
      }
      g.fillStyle(color, 0.55 + pulse * 0.22);
      g.fillCircle(x + 18, y - 14 + Math.sin(phase * 7) * 3, 2.3);
    } else if (kind === "read") {
      g.fillStyle(color, 0.1 + pulse * 0.08);
      g.fillTriangle(x, y - 31, x - 43, y + 4, x + 43, y + 4);
      g.lineStyle(1.2, color, alpha);
      g.strokeTriangle(x, y - 31, x - 43, y + 4, x + 43, y + 4);
      g.fillStyle(0x020713, 0.42);
      g.fillRect(x - 13, y - 28, 26, 22);
      g.lineStyle(1.1, color, 0.72);
      g.strokeRect(x - 13, y - 28, 26, 22);
      for (let i = 0; i < 4; i++) {
        g.lineBetween(x - 8, y - 23 + i * 5, x + 8, y - 23 + i * 5);
      }
    } else if (kind === "edit") {
      const slash = Math.sin(phase * 6) * 6;
      g.lineStyle(5, 0x020713, 0.34);
      g.lineBetween(x - 34, y - 1 + slash, x + 34, y - 31 - slash);
      g.lineStyle(2.4, color, 0.78);
      g.lineBetween(x - 34, y - 1 + slash, x + 34, y - 31 - slash);
      g.lineStyle(1.3, color, 0.46);
      g.strokeRect(x - 25, y - 16, 50, 21);
      g.lineBetween(x - 25, y - 5, x + 25, y - 5);
    } else if (kind === "search") {
      const sweep = phase * 1.8;
      const sx = Math.cos(sweep) * 34;
      const sy = Math.sin(sweep) * 18;
      g.lineStyle(1.3, color, 0.32 + pulse * 0.18);
      g.strokeCircle(x, y - 10, 27 + pulse * 6);
      g.strokeCircle(x, y - 10, 42 + pulse * 4);
      g.fillStyle(color, 0.1 + pulse * 0.08);
      g.fillTriangle(x, y - 10, x + sx, y - 10 + sy, x + sx * 0.25, y + 16);
      g.lineStyle(2, color, alpha);
      g.strokeCircle(x + sx * 0.36, y - 12 + sy * 0.36, 6);
      g.lineBetween(
        x + sx * 0.36 + 5,
        y - 7 + sy * 0.36,
        x + sx * 0.36 + 13,
        y + 1 + sy * 0.36
      );
    } else if (kind === "web") {
      for (let i = 0; i < 4; i++) {
        g.lineStyle(1.2, color, 0.22 + i * 0.1 + pulse * 0.06);
        g.strokeEllipse(x, y - 16, 34 + i * 15 + pulse * 8, 13 + i * 7);
      }
      g.lineStyle(1.1, color, alpha);
      g.lineBetween(x - 38, y - 16, x + 38, y - 16);
      g.lineBetween(x, y - 40, x, y + 8);
    } else if (kind === "permission" || kind === "prompt") {
      g.fillStyle(color, 0.12 + pulse * 0.08);
      g.fillTriangle(x, y - 43, x + 30, y - 20, x, y + 4);
      g.fillTriangle(x, y - 43, x, y + 4, x - 30, y - 20);
      g.lineStyle(1.8, color, alpha);
      g.strokeTriangle(x, y - 43, x + 30, y - 20, x, y + 4);
      g.strokeTriangle(x, y - 43, x, y + 4, x - 30, y - 20);
      g.lineStyle(3, color, 0.74);
      if (kind === "permission") {
        g.lineBetween(x - 7, y - 29, x - 7, y - 14);
        g.lineBetween(x + 7, y - 29, x + 7, y - 14);
      } else {
        g.lineBetween(x - 8, y - 28, x, y - 23);
        g.lineBetween(x, y - 23, x - 8, y - 18);
        g.lineBetween(x + 4, y - 14, x + 13, y - 14);
      }
    } else if (kind === "error") {
      g.fillStyle(color, 0.1 + pulse * 0.08);
      g.fillTriangle(x - 31, y + 2, x, y - 43, x + 31, y + 2);
      g.lineStyle(2.4, color, 0.76);
      g.beginPath();
      g.moveTo(x - 13, y - 35);
      g.lineTo(x - 3, y - 24);
      g.lineTo(x - 10, y - 12);
      g.lineTo(x + 4, y + 1);
      g.lineTo(x + 10, y - 14);
      g.lineTo(x + 20, y - 5);
      g.strokePath();
    } else if (kind === "success") {
      g.fillStyle(color, 0.12 + pulse * 0.12);
      g.fillCircle(x, y - 18, 23 + pulse * 5);
      g.lineStyle(3, color, 0.78);
      g.beginPath();
      g.moveTo(x - 15, y - 17);
      g.lineTo(x - 4, y - 5);
      g.lineTo(x + 18, y - 31);
      g.strokePath();
    } else if (kind === "subagent") {
      g.lineStyle(1.3, color, 0.38 + pulse * 0.18);
      g.strokeCircle(x, y - 17, 31);
      g.fillStyle(color, 0.68);
      for (let i = 0; i < 4; i++) {
        const a = phase * 1.8 + i * ((Math.PI * 2) / 4);
        g.fillCircle(x + Math.cos(a) * 31, y - 17 + Math.sin(a) * 18, 3);
      }
    } else {
      g.lineStyle(1.5, color, alpha);
      g.strokeCircle(x, y - 18, 19 + pulse * 6);
      g.lineBetween(x, y - 42, x, y + 6);
      g.lineBetween(x - 26, y - 18, x + 26, y - 18);
    }
  }

  private updateWielderOrder(
    worldRef: WorldRef,
    ref: WielderRef,
    unit: UnitState
  ) {
    const color = this.commandColorForUnit(worldRef, unit);
    const active =
      ref.isTraveling ||
      ref.locationMode === "mission" ||
      unit.status === "working" ||
      unit.status === "casting" ||
      unit.status === "fallen" ||
      unit.status === "complete";
    const wave = 0.5 + 0.5 * Math.sin(this.t * 5 + ref.homeIndex);
    const fineAlpha = this.fineDetailAlpha();
    ref.orderLine.clear();
    ref.orderRing.setVisible(active);
    ref.orderLabel.setVisible(active && fineAlpha > 0.22);
    if (!active) return;
    ref.orderLine.setAlpha(fineAlpha);
    ref.orderRing.setAlpha(0.45 + fineAlpha * 0.55);

    const target =
      ref.locationMode === "mission"
        ? this.missionSlotPosition(worldRef, this.missionSlotFor(ref))
        : this.baseSlotPosition(ref.homeIndex);
    const alpha = ref.isTraveling ? 0.58 : 0.28;
    this.strokeDashedLine(
      ref.orderLine,
      ref.container.x,
      ref.container.y,
      target.x,
      target.y,
      color,
      alpha,
      ref.isTraveling ? 2.2 : 1.3
    );
    if (ref.locationMode === "mission") {
      ref.orderLine.lineStyle(1.1, color, 0.2 + wave * 0.12);
      ref.orderLine.lineBetween(
        ref.container.x,
        ref.container.y,
        worldRef.container.x,
        worldRef.container.y
      );
    }

    ref.orderRing
      .setStrokeStyle(ref.isTraveling ? 2.4 : 1.8, color, 0.58 + wave * 0.28)
      .setScale(1.04 + wave * 0.12, 0.48 + wave * 0.05);
    ref.orderLabel
      .setText(this.commandLabelForUnit(unit))
      .setColor(unit.status === "fallen" ? "#ff9b8a" : "#fff8e0");
  }

  private commandLabelForUnit(unit: UnitState) {
    if (unit.status === "fallen") return "DOWN";
    if (unit.status === "complete") return "DONE";
    if (
      unit.lastTool ||
      unit.status === "working" ||
      unit.status === "casting"
    ) {
      return ORDER_LABELS[this.unitActivityKind(unit)];
    }
    if (unit.status === "moving") return "MOVE";
    return "IDLE";
  }

  private commandColorForUnit(worldRef: WorldRef, unit: UnitState) {
    if (unit.status === "fallen") return 0xff5a3c;
    if (unit.status === "complete") return 0xffd86b;
    if (
      unit.lastTool ||
      unit.status === "working" ||
      unit.status === "casting"
    ) {
      return activityColorForTheme(worldRef.theme, this.unitActivityKind(unit));
    }
    if (unit.status === "moving") return THEME_BIOMES[worldRef.theme].lane;
    return ROLE_PALETTE[unit.role].color;
  }

  private strokeDashedLine(
    g: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    color: number,
    alpha: number,
    width: number
  ) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    if (dist < 8) return;
    const ux = dx / dist;
    const uy = dy / dist;
    g.lineStyle(width + 4, 0x020713, alpha * 0.55);
    for (let d = 0; d < dist; d += ORDER_DASH + ORDER_GAP) {
      const end = Math.min(d + ORDER_DASH, dist);
      g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * end, y1 + uy * end);
    }
    g.lineStyle(width, color, alpha);
    for (let d = 0; d < dist; d += ORDER_DASH + ORDER_GAP) {
      const end = Math.min(d + ORDER_DASH, dist);
      g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * end, y1 + uy * end);
    }
  }

  /**
   * Build a scene-global wielder sprite container. The unit starts at the
   * central base unless it is already in an active/fallen mission state.
   */
  private spawnWielder(
    worldRef: WorldRef,
    unit: UnitState,
    index: number
  ): WielderRef {
    const palette = ROLE_PALETTE[unit.role];
    const homeIndex = (Math.abs(hashString(unit.id)) + index) % 12;
    const renown = renownForStats(
      useStore.getState().persisted.wielders[unitIdentityForUnit(unit)]
    );
    const locationMode: WielderRef["locationMode"] = this.shouldStandAtMission(
      unit
    )
      ? "mission"
      : "base";
    const start =
      locationMode === "mission"
        ? this.missionSlotPosition(worldRef, homeIndex)
        : this.baseSlotPosition(homeIndex);

    const glow = this.add.circle(0, 6, 16, palette.color, 0.28);

    // Warden aura — a colored ring that fades in when an aura state
    // activates and pulses while active. Hidden by default.
    const auraRing = this.add
      .circle(0, 4, 30, 0xffffff, 0)
      .setStrokeStyle(2.5, 0xffffff, 0)
      .setVisible(false);
    const orderLine = this.add.graphics().setDepth(48);
    const orderRing = this.add
      .circle(0, 7, 24, 0x000000, 0)
      .setStrokeStyle(1.8, palette.color, 0.65)
      .setScale(1, 0.46)
      .setVisible(false);
    const jobGfx = this.add.graphics().setVisible(false);
    const idleGfx = this.add.graphics().setVisible(false);
    const streakGfx = this.add.graphics().setVisible(false);

    // FF14 nameplate-style HP/MP bars — sit at the wielder's feet,
    // stacked HP-over-MP. Each bar = dark track + scaled fill.
    // Width 32, height 3. Fill origin (0, 0.5) so scaleX shrinks
    // from the right edge.
    const BAR_W = 32;
    const BAR_H = 3;
    const HP_Y = 14;
    const MP_Y = 18;
    const hpBarBg = this.add
      .rectangle(0, HP_Y, BAR_W, BAR_H, 0x000000, 0.75)
      .setStrokeStyle(1, 0x000000, 0.9);
    const hpBarFill = this.add
      .rectangle(-BAR_W / 2, HP_Y, BAR_W - 2, BAR_H - 1, 0x3da85f, 1)
      .setOrigin(0, 0.5);
    hpBarFill.scaleX = unit.hp / 100;
    const mpBarBg = this.add
      .rectangle(0, MP_Y, BAR_W, BAR_H, 0x000000, 0.75)
      .setStrokeStyle(1, 0x000000, 0.9);
    const mpBarFill = this.add
      .rectangle(-BAR_W / 2, MP_Y, BAR_W - 2, BAR_H - 1, 0x3a7bd5, 1)
      .setOrigin(0, 0.5);
    mpBarFill.scaleX = unit.mp / 100;

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

    // Critical-HP "!" — hidden by default; updateWielder toggles it.
    const criticalAlert = this.add
      .text(0, -42, "!", {
        fontSize: "14px",
        color: "#ff3a2c",
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 5, y: 0 },
      })
      .setOrigin(0.5)
      .setVisible(false);
    const orderLabel = this.add
      .text(0, 24, "", {
        fontSize: "7px",
        color: "#fff8e0",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
        backgroundColor: "rgba(6, 8, 18, 0.78)",
        padding: { x: 4, y: 1 },
      })
      .setOrigin(0.5)
      .setVisible(false);

    // Layer order matters: aura behind, body in middle, bars
    // on top so they read against the painterly hi-res sprite. The
    // critical "!" alert sits above everything so it always reads.
    const container = this.add.container(start.x, start.y, [
      auraRing,
      orderRing,
      glow,
      idleGfx,
      jobGfx,
      body,
      streakGfx,
      hpBarBg,
      hpBarFill,
      mpBarBg,
      mpBarFill,
      label,
      criticalAlert,
      orderLabel,
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

    this.agentLayer?.add([orderLine, container]);

    return {
      unitId: unit.id,
      role: unit.role,
      container,
      body,
      sprite,
      glow,
      auraRing,
      hpBarBg,
      hpBarFill,
      mpBarBg,
      mpBarFill,
      orderLine,
      orderRing,
      orderLabel,
      jobGfx,
      jobPhase: Math.random() * Math.PI * 2,
      idleGfx,
      idleQuirkKind: idleQuirkForRole(unit.role),
      idleQuirkPhase: Math.random() * Math.PI * 2,
      idleQuirkNextAt:
        this.time.now + IDLE_QUIRK_MIN_MS + Math.random() * IDLE_QUIRK_MAX_MS,
      idleQuirkUntil: 0,
      streakGfx,
      streakPoseKind: undefined,
      streakPoseUntil: 0,
      successStreak: 0,
      errorStreak: 0,
      label,
      criticalAlert,
      lastBarkAt: 0,
      homeIndex,
      formationSlot: undefined,
      locationMode,
      locationTargetKey: this.locationKeyFor(locationMode, worldRef.worldId),
      isTraveling: false,
      missionHoldUntil:
        locationMode === "mission" ? this.time.now + MISSION_DWELL_MS : 0,
      renownTier: renown.tier,
      renownScore: renown.score,
      patrolState: "scouting",
      patrolNextSwitchAt: this.time.now + 600 + Math.random() * 1800,
      lastStatus: unit.status,
      lastWardenAura: unit.auraState,
      lastEventAnimAt: 0,
      currentAnim: undefined,
      parentSessionId: unit.parentSessionId,
    };
  }

  /**
   * Add/remove riftling mob sprites for a world based on its current
   * riftling array. Riftling live inside the world's isoPlane container
   * so they share its scaling.
   */
  private syncRiftlingFor(worldRef: WorldRef, world: WorldState) {
    const seen = new Set<string>();
    for (const h of world.riftling) {
      seen.add(h.id);
      if (worldRef.riftling.has(h.id)) continue;
      worldRef.riftling.set(h.id, this.spawnRiftlingIn(worldRef, h));
    }
    for (const [id, ref] of worldRef.riftling) {
      if (!seen.has(id)) {
        this.poofRiftling(ref);
        worldRef.riftling.delete(id);
      }
    }
  }

  private tickRiftlingCombat(
    worldRef: WorldRef,
    world: WorldState,
    units: Record<string, UnitState>,
    delta: number
  ) {
    const dt = delta / 1000;
    for (const riftling of worldRef.riftling.values()) {
      riftling.bobOffset += delta * 0.004;
      riftling.shadow.setAlpha(0.42 + 0.18 * Math.sin(riftling.bobOffset));
      const target = this.pickRiftlingTarget(worldRef, world, riftling, units);
      if (!target) {
        this.nudgeRiftlingToward(
          riftling,
          Math.sin(riftling.bobOffset * 0.4) * 28,
          Math.cos(riftling.bobOffset * 0.35) * 18,
          RIFTLING_SPEED[riftling.type] * 0.45 * dt
        );
        continue;
      }

      const targetX =
        (target.ref.container.x - worldRef.container.x) / ISO_CONTAINER_SCALE;
      const targetY =
        (target.ref.container.y - worldRef.container.y) / ISO_CONTAINER_SCALE;
      const dist = this.nudgeRiftlingToward(
        riftling,
        targetX,
        targetY,
        RIFTLING_SPEED[riftling.type] * dt
      );
      riftling.body.setScale(targetX < riftling.container.x ? -1 : 1, 1);

      if (
        dist < RIFTLING_ATTACK_RANGE &&
        this.time.now - riftling.lastLungeAt > RIFTLING_ATTACK_COOLDOWN_MS
      ) {
        riftling.lastLungeAt = this.time.now;
        this.tweens.add({
          targets: riftling.body,
          x: { from: 0, to: (targetX - riftling.container.x) * 0.18 },
          y: { from: 0, to: (targetY - riftling.container.y) * 0.18 },
          yoyo: true,
          duration: 180,
          ease: "Sine.easeOut",
        });
        this.spawnCombatClash(
          target.ref.container.x,
          target.ref.container.y - 16,
          0xff5a3c
        );
        this.spawnRiftlingPressure(worldRef, riftling, target.ref);
        if (target.unit.status !== "fallen") {
          const attackAnim = ANIM.attack(target.unit.role);
          if (
            target.ref.sprite &&
            this.anims.exists(attackAnim) &&
            target.ref.currentAnim !== attackAnim
          ) {
            target.ref.sprite.play(attackAnim);
            target.ref.currentAnim = attackAnim;
            this.time.delayedCall(520, () => {
              if (!target.ref.sprite?.scene) return;
              this.playIdleAnimation(target.ref, target.unit.role);
            });
          }
          this.time.delayedCall(150, () => {
            if (!riftling.container.scene || !target.ref.container.scene)
              return;
            this.spawnCounterStrike(worldRef, riftling, target.ref);
          });
        }
      }
    }
  }

  private pickRiftlingTarget(
    worldRef: WorldRef,
    world: WorldState,
    riftling: RiftlingRef,
    units: Record<string, UnitState>
  ) {
    const preferredId = riftling.targetUnitId;
    const preferredRef = preferredId
      ? worldRef.wielders.get(preferredId)
      : undefined;
    const preferredUnit = preferredId ? units[preferredId] : undefined;
    if (preferredRef && preferredUnit && preferredUnit.status !== "fallen") {
      return { ref: preferredRef, unit: preferredUnit };
    }

    for (const id of world.unitIds) {
      const unit = units[id];
      const ref = worldRef.wielders.get(id);
      if (!unit || !ref || unit.status === "fallen") continue;
      if (ref.locationMode === "mission" || this.hasMissionStatus(unit)) {
        return { ref, unit };
      }
    }
    return undefined;
  }

  private nudgeRiftlingToward(
    riftling: RiftlingRef,
    targetX: number,
    targetY: number,
    maxStep: number
  ) {
    const dx = targetX - riftling.container.x;
    const dy = targetY - riftling.container.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      const step = Math.min(dist, maxStep);
      riftling.container.x += (dx / dist) * step;
      riftling.container.y += (dy / dist) * step;
    }
    return dist;
  }

  private spawnCombatClash(x: number, y: number, color: number) {
    const g = this.add.graphics().setPosition(x, y).setDepth(72);
    g.lineStyle(2.4, color, 0.95);
    g.beginPath();
    g.moveTo(-13, -5);
    g.lineTo(13, 5);
    g.moveTo(-8, 9);
    g.lineTo(9, -10);
    g.strokePath();
    g.fillStyle(0xfff4c7, 0.82);
    g.fillCircle(0, 0, 3);
    this.agentLayer?.add(g);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.65,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => g.destroy(),
    });
  }

  private riftlingScenePosition(worldRef: WorldRef, riftling: RiftlingRef) {
    return {
      x: worldRef.container.x + riftling.container.x * ISO_CONTAINER_SCALE,
      y: worldRef.container.y + riftling.container.y * ISO_CONTAINER_SCALE,
    };
  }

  private spawnRiftlingPressure(
    worldRef: WorldRef,
    riftling: RiftlingRef,
    target: WielderRef
  ) {
    const from = this.riftlingScenePosition(worldRef, riftling);
    const to = { x: target.container.x, y: target.container.y - 10 };
    const g = this.add.graphics().setDepth(71);
    g.lineStyle(5, 0x020713, 0.42);
    g.lineBetween(from.x, from.y - 8, to.x, to.y);
    g.lineStyle(1.8, 0xff5a3c, 0.68);
    g.lineBetween(from.x, from.y - 8, to.x, to.y);
    g.lineStyle(1.4, 0xff5a3c, 0.76);
    g.strokeEllipse(to.x, to.y + 17, 42, 16);
    g.fillStyle(0xff5a3c, 0.2);
    g.fillTriangle(to.x, to.y - 24, to.x - 16, to.y + 1, to.x + 16, to.y + 1);
    this.agentLayer?.add(g);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.18,
      duration: 420,
      ease: "Cubic.easeOut",
      onComplete: () => g.destroy(),
    });
  }

  private spawnCounterStrike(
    worldRef: WorldRef,
    riftling: RiftlingRef,
    target: WielderRef
  ) {
    const to = this.riftlingScenePosition(worldRef, riftling);
    const from = { x: target.container.x, y: target.container.y - 14 };
    const color = ROLE_PALETTE[target.role].color;
    const g = this.add.graphics().setDepth(73);
    g.lineStyle(6, 0x020713, 0.42);
    g.lineBetween(from.x, from.y, to.x, to.y - 8);
    g.lineStyle(2.4, color, 0.88);
    g.lineBetween(from.x, from.y, to.x, to.y - 8);
    g.fillStyle(0xfff4c7, 0.86);
    g.fillCircle(to.x, to.y - 8, 3.4);
    g.lineStyle(1.4, color, 0.62);
    g.strokeCircle(to.x, to.y - 8, 13);
    this.agentLayer?.add(g);
    this.tweens.add({
      targets: g,
      alpha: 0,
      scale: 1.24,
      duration: 360,
      ease: "Cubic.easeOut",
      onComplete: () => g.destroy(),
    });
    this.tweens.add({
      targets: riftling.body,
      alpha: { from: 0.45, to: 1 },
      duration: 180,
      ease: "Sine.easeOut",
    });
  }

  private createRiftlingTypeMark(type: Riftling["type"]) {
    const g = this.add.graphics();
    if (type === "bulwark") {
      g.fillStyle(0x020713, 0.46);
      g.fillEllipse(0, 4, 34, 22);
      g.lineStyle(1.4, 0xffb86c, 0.62);
      g.strokeEllipse(0, 4, 31, 18);
      g.lineStyle(1.2, 0xffd86b, 0.48);
      g.lineBetween(-11, 2, 11, 2);
    } else if (type === "soldier") {
      g.lineStyle(1.5, 0x6cc6ff, 0.58);
      g.strokeTriangle(0, -18, -13, 5, 13, 5);
      g.fillStyle(0x6cc6ff, 0.22);
      g.fillCircle(-10, 8, 4);
      g.fillCircle(10, 8, 4);
    } else {
      g.lineStyle(1.2, 0xc9a4ff, 0.44);
      g.strokeCircle(0, 0, 17);
      g.fillStyle(0xc9a4ff, 0.18);
      g.fillCircle(0, 0, 22);
    }
    return g;
  }

  private spawnRiftlingIn(worldRef: WorldRef, h: Riftling): RiftlingRef {
    // Spawn at a random edge tile (so they crawl in from the dark border).
    const edge = Math.floor(Math.random() * 4);
    let tx = 0,
      ty = 0;
    switch (edge) {
      case 0:
        tx = Math.random() * ISO_GRID;
        ty = -1;
        break;
      case 1:
        tx = ISO_GRID;
        ty = Math.random() * ISO_GRID;
        break;
      case 2:
        tx = Math.random() * ISO_GRID;
        ty = ISO_GRID;
        break;
      case 3:
        tx = -1;
        ty = Math.random() * ISO_GRID;
        break;
    }
    const offsetY = -(ISO_GRID * ISO_TILE_H) / 2;
    const x = (tx - ty) * (ISO_TILE_W / 2);
    const y = offsetY + (tx + ty) * (ISO_TILE_H / 2);

    const shadowSize =
      h.type === "bulwark"
        ? { w: 24, h: 7 }
        : h.type === "soldier"
          ? { w: 18, h: 5 }
          : { w: 16, h: 4 };
    const shadow = this.add.ellipse(
      0,
      h.type === "bulwark" ? 17 : 14,
      shadowSize.w,
      shadowSize.h,
      0x000000,
      0.55
    );
    const body = this.add.container(0, 0);
    const sheetKey = `riftling-${h.type.replace(/_/g, "")}-sheet`;
    if (this.textures.exists(sheetKey)) {
      const spr = this.add.sprite(0, 0, sheetKey, 0);
      const spriteScale =
        h.type === "bulwark" ? 2.05 : h.type === "soldier" ? 1.74 : 1.5;
      spr.setScale(spriteScale);
      this.tweens.add({
        targets: spr,
        y: { from: -1, to: 1 },
        yoyo: true,
        repeat: -1,
        duration: 600 + Math.random() * 400,
        ease: "Sine.easeInOut",
      });
      body.add(spr);
      body.add(this.createRiftlingTypeMark(h.type));
    } else {
      body.add(drawShadow(this, h.type));
    }
    const container = this.add.container(x, y, [shadow, body]);
    container.setScale(0.2);
    container.setAlpha(0);
    this.tweens.add({
      targets: container,
      scaleX: 1,
      scaleY: 1,
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

  private poofRiftling(ref: RiftlingRef) {
    if (!ref.container.scene) return;
    this.tweens.add({
      targets: ref.container,
      scaleX: 0.2,
      scaleY: 0.2,
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
   * Sized for the scene-global agent layer; bottom-center anchored so the
   * sprite's feet land on the container origin.
   */
  private populateWielderBody(
    body: Phaser.GameObjects.Container,
    role: keyof typeof ROLE_PALETTE
  ): Phaser.GameObjects.Sprite | undefined {
    const sheet = getSpritesheetConfig(role, this.textures);
    if (sheet) {
      const spr = this.add.sprite(0, 0, sheet.textureKey, 0);
      spr.setScale(WIELDER_SPRITE_SCALE);
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
      img.setScale(WIELDER_SPRITE_SCALE);
      img.setOrigin(0.5, 1);
      img.y = 8;
      body.add(img);
    }
    // No drawn-primitive fallback in Kingdom for now (deprecated path).
    return undefined;
  }

  private drawIsoThemeDressing(
    plane: Phaser.GameObjects.Container,
    theme: WorldTheme,
    isoToLocal: (tx: number, ty: number) => { x: number; y: number }
  ) {
    const g = this.add.graphics();
    const palette = THEME_BIOMES[theme];
    const center = isoToLocal(ISO_GRID / 2, ISO_GRID / 2);
    if (theme === "tide") {
      g.fillStyle(0x6cc6ff, 0.2);
      g.fillEllipse(center.x, center.y + 46, 190, 26);
      g.lineStyle(1.4, 0xb3e0ff, 0.58);
      for (let i = 0; i < 4; i++) {
        const y = center.y + 34 + i * 7;
        g.beginPath();
        for (let x = center.x - 95; x <= center.x + 95; x += 14) {
          const yy = y + Math.sin(x * 0.06 + i) * 3;
          if (x === center.x - 95) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
        g.strokePath();
      }
    } else if (theme === "crossroads") {
      g.lineStyle(5, 0x2a1720, 0.42);
      g.lineBetween(
        center.x - 114,
        center.y + 10,
        center.x + 112,
        center.y + 10
      );
      g.lineBetween(center.x, center.y - 58, center.x, center.y + 76);
      g.lineStyle(1.4, 0xffd86b, 0.42);
      for (let i = -2; i <= 2; i++) {
        g.lineBetween(
          center.x - 82,
          center.y + i * 18,
          center.x + 82,
          center.y + i * 18
        );
      }
    } else if (theme === "bastion") {
      for (let i = 0; i < 6; i++) {
        const a = i * ((Math.PI * 2) / 6);
        const x = center.x + Math.cos(a) * 78;
        const y = center.y + Math.sin(a) * 36;
        g.fillStyle(i % 2 === 0 ? palette.accent : palette.lane, 0.34);
        g.fillTriangle(x, y - 20, x - 9, y + 12, x + 10, y + 10);
        g.lineStyle(1, 0xffd86b, 0.3);
        g.strokeTriangle(x, y - 20, x - 9, y + 12, x + 10, y + 10);
      }
    } else if (theme === "dusk") {
      g.lineStyle(1.5, palette.accent, 0.4);
      g.strokeCircle(center.x, center.y - 10, 44);
      g.strokeCircle(center.x, center.y - 10, 66);
      g.lineStyle(3, 0x6b4423, 0.38);
      g.lineBetween(center.x - 92, center.y + 52, center.x + 92, center.y - 18);
      g.lineStyle(1, 0xffd86b, 0.38);
      for (let i = 0; i < 7; i++) {
        const x = center.x - 72 + i * 24;
        g.lineBetween(x, center.y + 42 - i * 4, x + 10, center.y + 34 - i * 4);
      }
    } else if (theme === "lantern") {
      g.lineStyle(1.6, 0xff7a4a, 0.48);
      for (let i = 0; i < 7; i++) {
        const x = center.x - 92 + i * 30;
        g.beginPath();
        g.moveTo(x, center.y + 48);
        g.lineTo(x + 10, center.y + 12);
        g.lineTo(x - 5, center.y - 20);
        g.strokePath();
      }
      g.fillStyle(0x05050a, 0.52);
      g.fillTriangle(
        center.x - 44,
        center.y - 60,
        center.x - 32,
        center.y - 54,
        center.x - 39,
        center.y - 49
      );
      g.fillTriangle(
        center.x + 58,
        center.y - 46,
        center.x + 70,
        center.y - 40,
        center.x + 63,
        center.y - 35
      );
    } else {
      g.lineStyle(1.5, palette.accent, 0.34);
      for (let i = 0; i < 10; i++) {
        const a = i * ((Math.PI * 2) / 10);
        g.lineBetween(
          center.x + Math.cos(a) * 28,
          center.y + Math.sin(a) * 12,
          center.x + Math.cos(a) * 104,
          center.y + Math.sin(a) * 52
        );
      }
      g.lineStyle(2, 0xffd86b, 0.36);
      g.strokeEllipse(center.x, center.y + 18, 138, 44);
    }
    plane.add(g);
  }

  /**
   * Build a small iso plane (ISO_GRID × ISO_GRID tiles) into the given
   * container, centered on the container origin, with the theme's
   * landmark sprite at center + small accent landmarks at fixed offsets.
   * Falls back to drawn polygons if the tile texture didn't load.
   */
  private buildIsoPlane(
    plane: Phaser.GameObjects.Container,
    theme: WorldTheme
  ) {
    const haveTiles =
      this.textures.exists("tile-iso-a") && this.textures.exists("tile-iso-b");
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
          tile.setTint(THEME_TILE_TINT[theme][(x + y) % 2]);
          tile.setAlpha(0.96);
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

    this.drawIsoThemeDressing(plane, theme, isoToLocal);

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

  private fineDetailAlpha() {
    return Phaser.Math.Clamp(
      (this.cameras.main.zoom - FINE_DETAIL_FADE_MIN_ZOOM) /
        (FINE_DETAIL_FADE_FULL_ZOOM - FINE_DETAIL_FADE_MIN_ZOOM),
      0,
      1
    );
  }

  private isWorldNearViewport(worldRef: WorldRef, pad = WORLD_CULL_PAD) {
    const view = this.mainCameraWorldView();
    return (
      worldRef.container.x >= view.x - pad &&
      worldRef.container.x <= view.x + view.width + pad &&
      worldRef.container.y >= view.y - pad &&
      worldRef.container.y <= view.y + view.height + pad
    );
  }

  private mainCameraWorldView() {
    const cam = this.cameras.main;
    if (cam.worldView.width > 0 && cam.worldView.height > 0) {
      return {
        x: cam.worldView.x,
        y: cam.worldView.y,
        width: cam.worldView.width,
        height: cam.worldView.height,
      };
    }
    const zoomX = Math.max(cam.zoomX, 0.001);
    const zoomY = Math.max(cam.zoomY, 0.001);
    return {
      x: cam.scrollX,
      y: cam.scrollY,
      width: cam.width / zoomX,
      height: cam.height / zoomY,
    };
  }

  private tacticalCameraWorldView() {
    const cam = this.cameras.main;
    const full = this.mainCameraWorldView();
    const safe = this.cameraSafeInsets();
    return createTacticalCameraWorldView(
      full,
      {
        width: cam.width,
        height: cam.height,
        zoomX: cam.zoomX,
        zoomY: cam.zoomY,
      },
      safe
    );
  }

  private worldToScreen(point: TacticalPoint): TacticalPoint {
    const cam = this.cameras.main;
    const view = this.mainCameraWorldView();
    return {
      x: cam.x + (point.x - view.x) * cam.zoomX,
      y: cam.y + (point.y - view.y) * cam.zoomY,
    };
  }

  private syncWorldCommandAnchor(activeWorldId: string | null) {
    const setAnchor = useStore.getState().setWorldCommandAnchor;
    if (!activeWorldId) {
      setAnchor(null);
      return;
    }
    const ref = this.worlds.get(activeWorldId);
    if (!ref) {
      setAnchor(null);
      return;
    }

    const worldX = ref.container.x;
    const worldY = ref.container.y - this.missionRingRadius() - 24;
    const screen = this.worldToScreen({ x: worldX, y: worldY });
    const cam = this.cameras.main;
    const margin = 160;
    setAnchor({
      worldId: activeWorldId,
      x: screen.x,
      y: screen.y,
      worldX,
      worldY,
      visible:
        screen.x >= -margin &&
        screen.x <= cam.width + margin &&
        screen.y >= -margin &&
        screen.y <= cam.height + margin,
    });
  }

  private drawTacticalMiniMap(
    worlds: Record<string, WorldState>,
    units: Record<string, UnitState>
  ) {
    const g = this.miniMapGfx;
    if (!g) return;
    const label = this.miniMapLabel;
    g.clear();
    if (this.worlds.size === 0) {
      label?.setVisible(false);
      this.miniMapHitArea?.setVisible(false);
      this.tacticalMapState = undefined;
      return;
    }

    const mainCam = this.cameras.main;
    const hudCam = this.hudCamera ?? mainCam;
    const width = Math.min(
      TACTICAL_MAP_MAX_W,
      Math.max(TACTICAL_MAP_MIN_W, hudCam.width * TACTICAL_MAP_WIDTH_RATIO)
    );
    const height = TACTICAL_MAP_HEIGHT;
    const defaultScreenX = hudCam.width / 2 - width / 2;
    const screenX = Phaser.Math.Clamp(
      defaultScreenX,
      12,
      Math.max(12, hudCam.width - width - 12)
    );
    const screenY = Phaser.Math.Clamp(
      hudCam.height - height - 12,
      86,
      Math.max(86, hudCam.height - height - 8)
    );
    g.setScrollFactor(0);
    g.setPosition(screenX, screenY);
    g.setScale(1);
    g.setAlpha(0.64);
    label
      ?.setVisible(true)
      .setText("TACTICAL MAP")
      .setScrollFactor(0)
      .setPosition(screenX + 14, screenY + 9)
      .setScale(1)
      .setAlpha(0.72);

    const x = 0;
    const y = 0;
    const pad = TACTICAL_MAP_PAD;
    const bounds = this.getRealmBounds([...this.worlds.values()]);
    const layout = { width, height, pad };
    const plot = (wx: number, wy: number) => ({
      ...projectWorldToTacticalMap({ x: wx, y: wy }, bounds, layout),
    });

    g.fillStyle(0x000000, 0.5);
    g.fillRoundedRect(x - 5, y - 5, width + 10, height + 10, 10);
    g.fillStyle(0x04060d, 0.97);
    g.fillRoundedRect(x, y, width, height, 8);
    g.fillStyle(0x0a1221, 0.94);
    g.fillRoundedRect(x + 8, y + 8, width - 16, 18, 6);
    g.fillStyle(0xffd86b, 0.72);
    g.fillRoundedRect(x + 16, y + 14, 54, 5, 3);
    g.fillStyle(0x6cc6ff, 0.48);
    g.fillRoundedRect(x + 76, y + 14, 34, 5, 3);
    g.fillStyle(0xffffff, 0.3);
    g.fillRoundedRect(x + width - 76, y + 14, 50, 5, 3);
    g.lineStyle(2.2, 0x6cc6ff, 0.92);
    g.strokeRoundedRect(x, y, width, height, 8);
    g.lineStyle(1, 0xffd86b, 0.28);
    g.strokeEllipse(
      x + width / 2,
      y + height / 2 + 7,
      width * 0.72,
      height * 0.58
    );

    const base = plot(0, 0);
    g.fillStyle(0xffd86b, 0.95);
    g.fillCircle(base.x, base.y, 5);
    g.lineStyle(1.4, 0xffd86b, 0.75);
    g.strokeCircle(base.x, base.y, 8.6);

    const worldPoints: TacticalMapState["worldPoints"] = [];
    for (const worldRef of this.worlds.values()) {
      const world = worlds[worldRef.worldId];
      if (!world) continue;
      const read = this.worldReadState(worldRef, world, units);
      const p = plot(worldRef.container.x, worldRef.container.y);
      worldPoints.push({
        worldId: worldRef.worldId,
        point: p,
        radius: read.state === "pressure" ? 13 : 11,
      });
      g.lineStyle(1.2, read.color, read.state === "idle" ? 0.24 : 0.42);
      g.lineBetween(base.x, base.y, p.x, p.y);
      g.fillStyle(read.color, read.state === "idle" ? 0.62 : 0.95);
      g.fillCircle(p.x, p.y, read.state === "pressure" ? 5.6 : 4.2);
      g.lineStyle(1.4, read.color, read.state === "idle" ? 0.52 : 0.78);
      g.strokeCircle(p.x, p.y, read.state === "sealed" ? 7.6 : 6.4);
    }

    const view = this.tacticalCameraWorldView();
    const viewport = projectViewportToTacticalMap(view, bounds, layout);
    const vx = viewport.x;
    const vy = viewport.y;
    const vw = viewport.width;
    const vh = viewport.height;
    g.fillStyle(0xffffff, 0.1);
    g.fillRect(vx, vy, vw, vh);
    g.lineStyle(1.8, 0xffffff, 0.86);
    g.strokeRect(vx, vy, vw, vh);
    this.tacticalMapState = {
      screenX,
      screenY,
      layout,
      bounds,
      viewport,
      worldPoints,
    };
    this.updateTacticalMapHitArea(screenX, screenY, width, height);
  }

  private updateTacticalMapHitArea(
    screenX: number,
    screenY: number,
    width: number,
    height: number
  ) {
    const hitArea = this.miniMapHitArea;
    if (!hitArea) return;
    hitArea
      .setVisible(true)
      .setPosition(screenX, screenY)
      .setSize(width, height)
      .setDisplaySize(width, height);
    const inputHitArea = hitArea.input?.hitArea;
    if (inputHitArea instanceof Phaser.Geom.Rectangle) {
      inputHitArea.setTo(0, 0, width, height);
    }
  }

  private installTacticalMapInput(hitArea: Phaser.GameObjects.Rectangle) {
    hitArea.on(
      "pointerdown",
      (
        pointer: Phaser.Input.Pointer,
        localX: number,
        localY: number,
        event: Phaser.Types.Input.EventData
      ) => {
        event.stopPropagation();
        if (pointer.button !== 0) return;
        const result = this.handleTacticalMapPointer({ x: localX, y: localY });
        this.tacticalMapDragMode = result === "pan" ? "pan" : null;
      }
    );
    hitArea.on(
      "pointermove",
      (pointer: Phaser.Input.Pointer, localX: number, localY: number) => {
        if (this.tacticalMapDragMode !== "pan" || !pointer.isDown) return;
        this.panTacticalMapTo({ x: localX, y: localY });
      }
    );
    hitArea.on("pointerup", () => {
      this.tacticalMapDragMode = null;
    });
    hitArea.on("pointerout", () => {
      this.tacticalMapDragMode = null;
    });
  }

  private handleTacticalMapPointer(point: TacticalPoint): "world" | "pan" {
    const worldId = this.pickTacticalMapWorld(point);
    if (worldId) {
      useStore.getState().selectWorld(worldId);
      this.lastUserCamMs = performance.now();
      return "world";
    }
    this.panTacticalMapTo(point);
    return "pan";
  }

  private pickTacticalMapWorld(point: TacticalPoint) {
    const state = this.tacticalMapState;
    if (!state) return undefined;
    let nearest:
      | { worldId: string; distance: number; radius: number }
      | undefined;
    for (const marker of state.worldPoints) {
      const distance = Math.hypot(
        point.x - marker.point.x,
        point.y - marker.point.y
      );
      if (!nearest || distance < nearest.distance) {
        nearest = {
          worldId: marker.worldId,
          distance,
          radius: marker.radius,
        };
      }
    }
    return nearest && nearest.distance <= nearest.radius
      ? nearest.worldId
      : undefined;
  }

  private panTacticalMapTo(point: TacticalPoint) {
    const state = this.tacticalMapState;
    if (!state) return;
    const worldPoint = unprojectTacticalMapToWorld(
      point,
      state.bounds,
      state.layout
    );
    this.panSafeViewportTo(worldPoint.x, worldPoint.y);
    this.lastUserCamMs = performance.now();
  }

  private panSafeViewportTo(worldX: number, worldY: number, duration = 220) {
    const cam = this.cameras.main;
    const safe = this.cameraSafeInsets();
    const zoomX = Math.max(cam.zoomX, 0.001);
    const zoomY = Math.max(cam.zoomY, 0.001);
    const safeW = Math.max(cam.width - safe.left - safe.right, 1);
    const safeH = Math.max(cam.height - safe.top - safe.bottom, 1);
    const safeCenterX = safe.left + safeW / 2;
    const safeCenterY = safe.top + safeH / 2;
    const fullCenterX = worldX + (cam.width / 2 - safeCenterX) / zoomX;
    const fullCenterY = worldY + (cam.height / 2 - safeCenterY) / zoomY;
    cam.pan(fullCenterX, fullCenterY, duration, "Sine.easeOut");
  }

  private pointerHitsTacticalMap(pointer: Phaser.Input.Pointer) {
    const state = this.tacticalMapState;
    if (!state) return false;
    return (
      pointer.x >= state.screenX &&
      pointer.x <= state.screenX + state.layout.width &&
      pointer.y >= state.screenY &&
      pointer.y <= state.screenY + state.layout.height
    );
  }

  private syncHudCameraLayer() {
    const hudCam = this.hudCamera;
    const miniMap = this.miniMapGfx;
    const label = this.miniMapLabel;
    const hitArea = this.miniMapHitArea;
    if (!hudCam || !miniMap || !label) return;

    const hudObjectsList = [miniMap, label, hitArea].filter(
      Boolean
    ) as Phaser.GameObjects.GameObject[];
    this.cameras.main.ignore(hudObjectsList);

    const hudObjects = new Set<Phaser.GameObjects.GameObject>(hudObjectsList);
    const ignored = this.children.list.filter(
      (child) => !hudObjects.has(child)
    );
    if (ignored.length > 0) {
      hudCam.ignore(ignored);
    }
  }

  private installCameraControls() {
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      if (this.pointerHitsTacticalMap(p)) return;
      this.dragOriginScroll = {
        x: this.cameras.main.scrollX,
        y: this.cameras.main.scrollY,
      };
      this.dragOriginPointer = { x: p.x, y: p.y };
      this.didDrag = false;
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.dragOriginScroll || !this.dragOriginPointer)
        return;
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
      (_p: Phaser.Input.Pointer, _g: unknown, _dx: number, dy: number) => {
        if (this.pointerHitsTacticalMap(_p)) return;
        const cam = this.cameras.main;
        const factor = dy > 0 ? 1 / 1.1 : 1.1;
        const minZoom = this.strategyMinZoom();
        const nextZoom = Phaser.Math.Clamp(cam.zoom * factor, minZoom, 2.5);
        cam.setZoom(nextZoom);
        if (nextZoom <= minZoom + 0.001) {
          this.centerCameraOnRealm();
        }
        this.lastUserCamMs = performance.now();
      }
    );
  }

  private drawSky() {
    this.skyGfx = this.add.graphics().setDepth(-100).setScrollFactor(0);
    this.repaintSky();
  }

  private repaintSky() {
    if (!this.skyGfx) return;
    const g = this.skyGfx;
    const w = this.scale.width;
    const h = this.scale.height;
    g.clear();

    g.lineStyle(2, 0x6cc6ff, 0.08);
    g.beginPath();
    g.moveTo(-w * 0.1, h * 0.72);
    g.lineTo(w * 0.3, h * 0.48);
    g.lineTo(w * 0.72, h * 0.58);
    g.lineTo(w * 1.1, h * 0.36);
    g.strokePath();

    g.lineStyle(1.4, 0xffd86b, 0.06);
    g.beginPath();
    g.moveTo(w * 0.02, h * 0.18);
    g.lineTo(w * 0.38, h * 0.32);
    g.lineTo(w * 0.72, h * 0.18);
    g.lineTo(w * 1.04, h * 0.26);
    g.strokePath();

    g.lineStyle(1, 0xffd86b, 0.045);
    for (let i = 0; i < 7; i++) {
      const y = h * (0.16 + i * 0.105);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y + Math.sin(i * 1.7) * 36);
      g.strokePath();
    }
    g.lineStyle(1, 0x6cc6ff, 0.035);
    for (let i = 0; i < 6; i++) {
      const x = w * (0.08 + i * 0.18);
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + Math.sin(i * 1.2) * 48, h);
      g.strokePath();
    }
    this.updateViewportBackdrops();
  }

  private updateViewportBackdrops() {
    const cam = this.cameras.main;
    const scale = Math.max(1, 1 / Math.max(cam.zoom, 0.01));
    const minZoom = this.strategyMinZoom();
    const skyAlpha =
      cam.zoom < 0.72
        ? Phaser.Math.Clamp((cam.zoom - minZoom) / (0.72 - minZoom), 0, 1)
        : 1;
    this.skyGfx?.setScale(scale).setAlpha(skyAlpha);
    if (this.scanline) {
      this.scanline.setScale(scale);
      this.scanline.setAlpha(cam.zoom < 0.72 ? 0 : 0.4);
    }
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
    this.hudCamera?.setViewport(0, 0, this.scale.width, this.scale.height);
    this.hudCamera?.setScroll(0, 0).setZoom(1);
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
function idleQuirkForRole(role: UnitState["role"]): IdleQuirkKind {
  if (role === "warden1") return "watch";
  if (role === "warden2") return "garden";
  if (role === "warden3") return "forge";
  return "tide";
}

function letterSignalColor(letter: Letter): number {
  if (letter.risk === "high") return 0xff5a3c;
  if (letter.risk === "elevated") return 0xffb86c;
  if (letter.severity === "critical") return 0xff5a3c;
  if (letter.severity === "important") return 0xffd86b;
  return 0x6cc6ff;
}

function letterActivityKind(letter: Letter): WorldActivityKind {
  if (letter.severity === "critical") return "error";
  if (letter.title.toLowerCase().includes("finished")) return "success";
  if (letter.title.toLowerCase().includes("form")) return "subagent";
  if (letter.actions.some((entry) => entry.action.kind === "send-word")) {
    return "prompt";
  }
  return letter.severity === "important" ? "permission" : "generic";
}

function letterSignalLabel(letter: Letter): string {
  if (letter.severity === "critical") return "DECREE";
  if (letter.severity === "important") return "LETTER";
  return "NOTE";
}

function renownForStats(stats: WielderStats | undefined): {
  tier: RenownTier;
  stars: string;
  score: number;
} {
  if (!stats) return { tier: "New", stars: "", score: 0 };
  const score = stats.visits + stats.seals * 3 - stats.falls * 2;
  if (score >= 24) return { tier: "Hero", stars: "***", score };
  if (score >= 12) return { tier: "Veteran", stars: "**", score };
  if (score >= 4) return { tier: "Apprentice", stars: "*", score };
  return { tier: "New", stars: "", score };
}

function renownRank(tier: RenownTier): number {
  if (tier === "Hero") return 3;
  if (tier === "Veteran") return 2;
  if (tier === "Apprentice") return 1;
  return 0;
}
