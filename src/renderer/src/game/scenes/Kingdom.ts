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
import type { WorldState, WorldAlertLevel } from "@shared/events";
import {
  drawGummiWorld,
  themeFor,
  themeLabel,
  type WorldTheme,
} from "../gummi-worlds";

const SCANLINE_TEX = "kh-kingdom-scanlines";

const ALERT_RING_COLOR: Record<WorldAlertLevel, number> = {
  idle: 0x2a3556,
  active: 0x6cc6ff,
  warning: 0xffb86c,
  danger: 0xff5a3c,
  cleared: 0xffd86b,
};

type WorldRef = {
  worldId: string;
  container: Phaser.GameObjects.Container;
  alertRing: Phaser.GameObjects.Arc;
  countText: Phaser.GameObjects.Text;
  countBg: Phaser.GameObjects.Rectangle;
  theme: WorldTheme;
  alertLevel: WorldAlertLevel;
};

type StarRef = {
  circle: Phaser.GameObjects.Arc;
  twinklePhase: number;
  baseAlpha: number;
};

export class KingdomScene extends Phaser.Scene {
  private worlds = new Map<string, WorldRef>();
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

  constructor() {
    super("kingdom");
  }

  create() {
    this.cameras.main.setBackgroundColor("#04060d");

    // Tier 1 filter stack — shared across the whole map
    const cm = this.cameras.main.filters.internal.addColorMatrix();
    cm.colorMatrix.saturate(0.15, true).hue(-6, true).contrast(0.05, true);
    this.cameras.main.filters.internal.addGlow(0xffd86b, 0.45, 0.25, 1, false, 4, 8);
    this.cameras.main.filters.internal.addVignette(0.5, 0.5, 0.85, 0.5);

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

    // Camera control
    this.installCameraControls();

    // Resize handling
    this.scale.on("resize", () => this.handleResize());

    this.events.once("shutdown", () => {
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

    // Update per-world live state (count, alert ring color)
    for (const [id, ref] of this.worlds) {
      const w = worlds[id];
      if (!w) continue;
      ref.countText.setText(String(w.unitIds.length));
      ref.countBg.setVisible(w.unitIds.length > 0);
      ref.countText.setVisible(w.unitIds.length > 0);
      if (w.alertLevel !== ref.alertLevel) {
        ref.alertRing.setStrokeStyle(2.5, ALERT_RING_COLOR[w.alertLevel], 1);
        ref.alertLevel = w.alertLevel;
      }
      // Pulse the ring on warning/danger
      if (w.alertLevel === "warning" || w.alertLevel === "danger") {
        const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
        ref.alertRing.setAlpha(0.6 + 0.4 * pulse);
      } else {
        ref.alertRing.setAlpha(1);
      }
    }

    // Twinkle stars
    for (const s of this.stars) {
      s.twinklePhase += delta * 0.001;
      s.circle.setAlpha(s.baseAlpha * (0.6 + 0.4 * Math.sin(s.twinklePhase)));
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
        }
      }
    }
  }

  private syncWorlds(worlds: Record<string, WorldState>) {
    const seen = new Set(Object.keys(worlds));
    const prevCount = this.worlds.size;
    for (const [id, ref] of this.worlds) {
      if (!seen.has(id)) {
        ref.container.destroy(true);
        this.worlds.delete(id);
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
    const pos = positionForWorld(worldId);
    const container = this.add.container(pos.x, pos.y);

    const alertRing = this.add
      .circle(0, 0, 56, 0x000000, 0)
      .setStrokeStyle(2.5, ALERT_RING_COLOR[world.alertLevel], 1);

    const planet = drawGummiWorld(this, theme);
    planet.setScale(1.1);

    const label = this.add
      .text(0, 56, world.label, {
        fontSize: "13px",
        color: "#cfd9f0",
        fontFamily: "system-ui, sans-serif",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0);

    const themeText = this.add
      .text(0, 74, themeLabel(theme).toUpperCase(), {
        fontSize: "9px",
        color: "#8aa0d0",
        fontFamily: "ui-monospace, monospace",
        letterSpacing: 1,
      })
      .setOrigin(0.5, 0);

    const countBg = this.add
      .rectangle(38, -38, 22, 16, 0x1a2244, 0.95)
      .setStrokeStyle(1, 0xffd86b, 0.6)
      .setVisible(world.unitIds.length > 0);
    const countText = this.add
      .text(38, -38, String(world.unitIds.length), {
        fontSize: "11px",
        color: "#ffd86b",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setVisible(world.unitIds.length > 0);

    container.add([alertRing, planet, label, themeText, countBg, countText]);

    // Click → select world's first wielder + pan camera here
    alertRing.setInteractive({ useHandCursor: true });
    alertRing.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (p.button !== 0) return;
      // Defer the action until pointerup so we can distinguish click vs drag
    });
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
      alertRing,
      countText,
      countBg,
      theme,
      alertLevel: world.alertLevel,
    };
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
 * Hash-based world position. Spreads worlds across a large coordinate space
 * so the camera actually has somewhere to pan.
 *
 * TODO (task #15): replace with constellation clustering by git remote /
 * shared parent path.
 */
function positionForWorld(worldId: string): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < worldId.length; i++) {
    h = (Math.imul(31, h) + worldId.charCodeAt(i)) | 0;
  }
  const radius = 250 + (Math.abs(h) % 1500);
  const angle = ((Math.abs(h >> 8) % 360) * Math.PI) / 180;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}
