import * as Phaser from "phaser";
import { useStore } from "../../store";
import type { WorldAlertLevel } from "@shared/events";
import {
  drawGummiWorld,
  themeFor,
  themeLabel,
  type WorldTheme,
} from "../gummi-worlds";

type PlanetRef = {
  worldId: string;
  container: Phaser.GameObjects.Container;
  themeIcon: Phaser.GameObjects.Container;
  ring: Phaser.GameObjects.Arc;
  alertRing: Phaser.GameObjects.Arc;
  countText: Phaser.GameObjects.Text;
  labelText: Phaser.GameObjects.Text;
  themeText: Phaser.GameObjects.Text;
  heartBadge: Phaser.GameObjects.Container;
  heartCount: Phaser.GameObjects.Text;
  clearedMark: Phaser.GameObjects.Star;
  theme: WorldTheme;
  alertLevel: WorldAlertLevel;
};

const ALERT_RING_COLOR: Record<WorldAlertLevel, number> = {
  idle: 0x2a3556,
  active: 0x6cc6ff,
  warning: 0xffb86c,
  danger: 0xff5a3c,
  cleared: 0xffd86b,
};

type StarRef = {
  circle: Phaser.GameObjects.Arc;
  speed: number;
  twinklePhase: number;
  baseAlpha: number;
};

type DustRef = {
  circle: Phaser.GameObjects.Arc;
  vy: number;
  vx: number;
  baseAlpha: number;
};

const SCANLINE_TEX = "kh-scanlines";

export class WorldSelectScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private emptyText: Phaser.GameObjects.Text | null = null;
  private skyGfx?: Phaser.GameObjects.Graphics;
  private nebulae: Phaser.GameObjects.Arc[] = [];
  private stars: StarRef[] = [];
  private dust: DustRef[] = [];
  private scanline?: Phaser.GameObjects.TileSprite;
  private planets = new Map<string, PlanetRef>();
  private lastEventCount = -1;
  private lastWorldsKey = "";
  private t = 0;

  constructor() {
    super("worldSelect");
  }

  create() {
    this.cameras.main.setBackgroundColor("#04060d");

    // ── Tier 1 filter stack (color grade → glow → vignette) ─────────
    const cm = this.cameras.main.filters.internal.addColorMatrix();
    // Cool space tint with slight contrast boost.
    cm.colorMatrix.saturate(0.15, true).hue(-6, true).contrast(0.05, true);
    this.cameras.main.filters.internal.addGlow(0xffd86b, 0.45, 0.25, 1, false, 4, 8);
    this.cameras.main.filters.internal.addVignette(0.5, 0.5, 0.85, 0.5);

    // ── Atmosphere layers (depth ordering) ──────────────────────────
    this.drawGradientSky();           // depth -100
    this.drawNebulae(5);              // depth -90
    this.spawnStarLayer(60, 0.04, 0.18, 1, 1, 0.25, 0.55, -80);   // far
    this.spawnStarLayer(45, 0.18, 0.55, 1, 2, 0.55, 0.85, -70);   // mid
    this.spawnStarLayer(18, 0.6, 1.4, 1, 2, 0.85, 1.0, -60);      // near
    this.spawnDriftDust(40, -50);

    this.title = this.add.text(this.scale.width / 2, 36, "GUMMI MAP", {
      fontSize: "22px",
      color: "#ffd86b",
      fontFamily: "system-ui",
      fontStyle: "bold",
    }).setOrigin(0.5);
    this.subtitle = this.add.text(this.scale.width / 2, 64, "tap a world to land", {
      fontSize: "12px",
      color: "#8aa0d0",
    }).setOrigin(0.5);

    // ── Scanline overlay (always on top) ────────────────────────────
    this.ensureScanlineTexture();
    this.scanline = this.add
      .tileSprite(0, 0, this.scale.width, this.scale.height, SCANLINE_TEX)
      .setOrigin(0, 0)
      .setDepth(1000)
      .setAlpha(0.5);

    this.scale.on("resize", () => this.layout());
    this.layout();

    this.events.once("shutdown", () => {
      this.planets.clear();
      this.stars = [];
      this.dust = [];
      this.nebulae = [];
      this.skyGfx = undefined;
      this.scanline = undefined;
      this.emptyText = null;
      this.lastEventCount = -1;
      this.lastWorldsKey = "";
    });
  }

  private drawGradientSky() {
    const g = this.add.graphics();
    g.fillGradientStyle(0x0a0518, 0x0a0518, 0x1a0a30, 0x1a0a30, 1);
    g.fillRect(0, 0, this.scale.width, this.scale.height);
    g.setDepth(-100);
    this.skyGfx = g;
  }

  private drawNebulae(n: number) {
    // Soft tinted blobs that read as deep-space gas clouds. Low alpha so
    // the planets still pop. Slight slow drift in update().
    const palette = [0x4a2070, 0x2c5e8a, 0x6b2bbf, 0x4d7eff];
    for (let i = 0; i < n; i++) {
      const cloud = this.add.circle(
        Math.random() * this.scale.width,
        Math.random() * this.scale.height,
        100 + Math.random() * 180,
        palette[Math.floor(Math.random() * palette.length)],
        0.08 + Math.random() * 0.08
      );
      cloud.setDepth(-90);
      this.nebulae.push(cloud);
    }
  }

  private spawnStarLayer(
    n: number,
    speedMin: number,
    speedMax: number,
    sizeMin: number,
    sizeMax: number,
    alphaMin: number,
    alphaMax: number,
    depth: number
  ) {
    for (let i = 0; i < n; i++) {
      const baseAlpha = alphaMin + Math.random() * (alphaMax - alphaMin);
      const star = this.add.circle(
        Math.random() * this.scale.width,
        Math.random() * this.scale.height,
        sizeMin + Math.random() * (sizeMax - sizeMin),
        0xffffff,
        baseAlpha
      );
      star.setDepth(depth);
      this.stars.push({
        circle: star,
        speed: speedMin + Math.random() * (speedMax - speedMin),
        twinklePhase: Math.random() * Math.PI * 2,
        baseAlpha,
      });
    }
  }

  private spawnDriftDust(n: number, depth: number) {
    // Floating gold/cyan motes — sells "ambient particle life" without a
    // particle emitter. Drift gently up + slight horizontal sway.
    for (let i = 0; i < n; i++) {
      const baseAlpha = 0.15 + Math.random() * 0.25;
      const color = Math.random() < 0.55 ? 0xffd86b : 0x6cc6ff;
      const mote = this.add.circle(
        Math.random() * this.scale.width,
        Math.random() * this.scale.height,
        Math.random() < 0.7 ? 1 : 1.6,
        color,
        baseAlpha
      );
      mote.setDepth(depth);
      this.dust.push({
        circle: mote,
        vy: -(0.05 + Math.random() * 0.15),
        vx: (Math.random() - 0.5) * 0.05,
        baseAlpha,
      });
    }
  }

  private ensureScanlineTexture() {
    if (this.textures.exists(SCANLINE_TEX)) return;
    // 1×4 vertical strip: dark, transparent, dark, transparent. Tiles
    // vertically across the scene as a CRT-style scanline overlay.
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

  update(_time: number, delta: number) {
    this.t += delta;
    const dt = delta / 16;
    const w = this.scale.width;
    const h = this.scale.height;

    // Star layers — y-drift + occasional twinkle.
    for (const s of this.stars) {
      s.circle.y += s.speed * dt;
      if (s.circle.y > h) {
        s.circle.y = -2;
        s.circle.x = Math.random() * w;
      }
      // Bright stars twinkle gently, dim stars stay quiet.
      if (s.baseAlpha > 0.7) {
        const tw = 0.15 * Math.sin(this.t * 0.005 + s.twinklePhase);
        s.circle.setAlpha(s.baseAlpha + tw);
      }
    }

    // Dust drift — lazy upward float with horizontal sway.
    for (const d of this.dust) {
      d.circle.y += d.vy * dt;
      d.circle.x += d.vx * dt;
      if (d.circle.y < -4) {
        d.circle.y = h + 4;
        d.circle.x = Math.random() * w;
      }
      if (d.circle.x < -4) d.circle.x = w + 4;
      if (d.circle.x > w + 4) d.circle.x = -4;
    }

    // Nebula clouds — slowly rotate + breathe. Subtle, very low frequency.
    for (let i = 0; i < this.nebulae.length; i++) {
      const c = this.nebulae[i];
      const phase = this.t * 0.0004 + i;
      c.setScale(1 + Math.sin(phase) * 0.04);
    }

    // Scanline subtle vertical shimmer — keeps it from feeling baked-in.
    if (this.scanline) {
      this.scanline.tilePositionY = (this.t * 0.02) % 4;
    }

    const ec = useStore.getState().eventCount;
    const worlds = useStore.getState().worlds;
    const key = Object.keys(worlds)
      .sort()
      .map(
        (k) =>
          `${k}:${worlds[k].unitIds.length}:${worlds[k].alertLevel}:${worlds[k].heartless.length}`
      )
      .join("|");
    if (ec !== this.lastEventCount || key !== this.lastWorldsKey) {
      this.lastEventCount = ec;
      this.lastWorldsKey = key;
      this.syncPlanets();
    }

    for (const ref of this.planets.values()) {
      ref.ring.rotation = this.t * 0.0015;
      // Alert-level driven pulse: danger pulses fast, cleared steady.
      let pulseSpeed = 0.004;
      let pulseAmp = 0.04;
      switch (ref.alertLevel) {
        case "danger":
          pulseSpeed = 0.012;
          pulseAmp = 0.1;
          break;
        case "warning":
          pulseSpeed = 0.008;
          pulseAmp = 0.06;
          break;
        case "active":
          pulseSpeed = 0.006;
          pulseAmp = 0.05;
          break;
        case "cleared":
          pulseSpeed = 0.002;
          pulseAmp = 0.02;
          break;
      }
      const pulse = 1 + Math.sin(this.t * pulseSpeed) * pulseAmp;
      ref.themeIcon.setScale(pulse);

      // Alert ring breathes — alpha modulated by sine
      const breath =
        ref.alertLevel === "idle"
          ? 0.25
          : 0.4 + (Math.sin(this.t * pulseSpeed * 1.4) + 1) * 0.25;
      ref.alertRing.setStrokeStyle(2.5, ALERT_RING_COLOR[ref.alertLevel], breath);

      // Cleared mark slowly rotates
      ref.clearedMark.rotation = this.t * 0.001;
    }
  }

  private layout() {
    if (this.title) this.title.setX(this.scale.width / 2);
    if (this.subtitle) this.subtitle.setX(this.scale.width / 2);
    if (this.emptyText) {
      this.emptyText.setPosition(this.scale.width / 2, this.scale.height / 2);
    }
    if (this.skyGfx) {
      this.skyGfx.clear();
      this.skyGfx.fillGradientStyle(0x0a0518, 0x0a0518, 0x1a0a30, 0x1a0a30, 1);
      this.skyGfx.fillRect(0, 0, this.scale.width, this.scale.height);
    }
    if (this.scanline) {
      this.scanline.setSize(this.scale.width, this.scale.height);
    }
    this.repositionPlanets();
  }

  private syncPlanets() {
    const worlds = Object.values(useStore.getState().worlds);

    if (worlds.length === 0) {
      if (!this.emptyText) {
        this.emptyText = this.add.text(
          this.scale.width / 2,
          this.scale.height / 2,
          "no worlds discovered yet\nspawn a unit or run claude in a directory",
          { fontSize: "13px", color: "#8aa0d0", align: "center", lineSpacing: 6 }
        ).setOrigin(0.5);
      }
      for (const ref of this.planets.values()) ref.container.destroy(true);
      this.planets.clear();
      return;
    }

    if (this.emptyText) {
      this.emptyText.destroy();
      this.emptyText = null;
    }

    const seen = new Set<string>();
    for (const world of worlds) {
      seen.add(world.id);
      let ref = this.planets.get(world.id);
      if (!ref) {
        ref = this.createPlanet(world.id, world.label, world.unitIds.length);
        this.planets.set(world.id, ref);
      } else {
        ref.countText.setText(String(world.unitIds.length));
        ref.labelText.setText(world.label);
      }
      this.applyAlertState(ref, world.alertLevel, world.heartless.length);
    }
    for (const [id, ref] of this.planets) {
      if (!seen.has(id)) {
        ref.container.destroy(true);
        this.planets.delete(id);
      }
    }
    this.repositionPlanets();
  }

  private applyAlertState(
    ref: PlanetRef,
    level: WorldAlertLevel,
    heartlessCount: number
  ) {
    const wasCleared = ref.alertLevel === "cleared";
    ref.alertLevel = level;
    const ringColor = ALERT_RING_COLOR[level];
    ref.ring.setStrokeStyle(1.4, ringColor, 0.55);
    if (level === "idle") {
      ref.themeIcon.setAlpha(0.55);
    } else {
      ref.themeIcon.setAlpha(1);
    }
    ref.clearedMark.setVisible(level === "cleared");
    if (heartlessCount > 0) {
      ref.heartBadge.setVisible(true);
      ref.heartCount.setText(String(heartlessCount));
    } else {
      ref.heartBadge.setVisible(false);
    }
    // First-time transition into cleared → fire the seal fanfare.
    if (level === "cleared" && !wasCleared) {
      this.sealFanfare(ref);
    }
  }

  private sealFanfare(ref: PlanetRef) {
    const x = ref.container.x;
    const y = ref.container.y;
    // Light beam descending from above onto the planet.
    const beam = this.add
      .rectangle(x, y - 280, 28, 600, 0xffd86b, 0.55)
      .setOrigin(0.5, 0)
      .setDepth(900);
    this.tweens.add({
      targets: beam,
      alpha: 0,
      scaleX: 2.2,
      duration: 1400,
      onComplete: () => beam.destroy(),
    });
    // Expanding ring shockwave.
    const ring = this.add
      .circle(x, y, 50, 0xffd86b, 0)
      .setStrokeStyle(3, 0xffd86b, 1)
      .setDepth(901);
    this.tweens.add({
      targets: ring,
      radius: 160,
      alpha: 0,
      duration: 900,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });
    // Brief planet pop.
    this.tweens.add({
      targets: ref.themeIcon,
      scale: 1.25,
      yoyo: true,
      duration: 300,
      ease: "Quad.easeOut",
    });
    // Particle burst — gold star glints.
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const star = this.add
        .star(x, y, 4, 2, 5, 0xffd86b)
        .setStrokeStyle(0.8, 0xffffff, 1)
        .setDepth(902);
      this.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * 80,
        y: y + Math.sin(angle) * 80,
        alpha: 0,
        scale: 0.3,
        angle: 360,
        duration: 900,
        ease: "Sine.easeOut",
        onComplete: () => star.destroy(),
      });
    }
    // KEYHOLE banner.
    const banner = this.add
      .text(x, y - 70, "KEYHOLE SEALED", {
        fontSize: "13px",
        color: "#ffd86b",
        fontStyle: "bold",
        backgroundColor: "rgba(0,0,0,0.65)",
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0.5)
      .setDepth(903);
    this.tweens.add({
      targets: banner,
      y: y - 100,
      alpha: 0,
      duration: 1700,
      ease: "Sine.easeOut",
      onComplete: () => banner.destroy(),
    });
  }

  private createPlanet(worldId: string, label: string, unitCount: number): PlanetRef {
    const theme = themeFor(worldId);

    // Outer alert ring — colored by alert level, breathes via update().
    const alertRing = this.add
      .circle(0, 0, 70, 0x000000, 0)
      .setStrokeStyle(2.5, 0x2a3556, 0.4);
    const ring = this.add
      .circle(0, 0, 58, 0x000000, 0)
      .setStrokeStyle(1.4, 0x2a3556, 0.55);

    // Themed world icon (atmosphere disc + silhouette) replaces the plain
    // colored disc. Each repo deterministically lands on the same KH world.
    const themeIcon = drawGummiWorld(this, theme);

    // Unit count rendered as a small badge on the lower-right of the icon
    // so the silhouette stays readable.
    const countBg = this.add
      .circle(0, 0, 11, 0x04060d, 0.92)
      .setStrokeStyle(1.5, 0xffd86b, 0.95);
    const countText = this.add
      .text(0, 0, String(unitCount), {
        fontSize: "12px",
        color: "#ffd86b",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const countBadge = this.add.container(30, 26, [countBg, countText]);

    const themeText = this.add
      .text(0, 50, themeLabel(theme).toUpperCase(), {
        fontSize: "9px",
        color: "#ffd86b",
        fontFamily: "ui-monospace, monospace",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const labelText = this.add
      .text(0, 64, label, {
        fontSize: "11px",
        color: "#8aa0d0",
        fontFamily: "ui-monospace, monospace",
      })
      .setOrigin(0.5);

    // Heartless count badge — small dark circle with yellow number,
    // positioned at upper-right of the planet. Hidden when count = 0.
    const heartBadgeBg = this.add
      .circle(0, 0, 13, 0x05050a, 0.95)
      .setStrokeStyle(1.5, 0xffd86b, 1);
    const heartCount = this.add
      .text(0, 0, "0", {
        fontSize: "12px",
        color: "#ffd86b",
        fontStyle: "bold",
      })
      .setOrigin(0.5);
    const heartBadge = this.add.container(30, -28, [heartBadgeBg, heartCount]);
    heartBadge.setVisible(false);

    // Cleared world checkmark — gold star above the planet.
    const clearedMark = this.add
      .star(0, -52, 5, 4, 9, 0xffd86b)
      .setStrokeStyle(1, 0xffffff, 0.95);
    clearedMark.setVisible(false);

    // Invisible hit-pad — Phaser container hit-areas have alignment quirks
    // when the container has children at varied local positions. Putting an
    // explicit interactive circle on top is more reliable.
    const hitPad = this.add.circle(0, 0, 70, 0xffffff, 0);
    hitPad.setInteractive({ useHandCursor: true });
    hitPad.on("pointerover", () => {
      this.tweens.add({ targets: themeIcon, scale: 1.12, duration: 120 });
    });
    hitPad.on("pointerout", () => {
      this.tweens.add({ targets: themeIcon, scale: 1, duration: 120 });
    });
    hitPad.on("pointerdown", () => {
      useStore.getState().selectWorld(worldId);
    });

    const container = this.add.container(0, 0, [
      alertRing,
      ring,
      themeIcon,
      clearedMark,
      themeText,
      labelText,
      countBadge,
      heartBadge,
      hitPad,
    ]);

    return {
      worldId,
      container,
      themeIcon,
      ring,
      alertRing,
      countText,
      labelText,
      themeText,
      heartBadge,
      heartCount,
      clearedMark,
      theme,
      alertLevel: "idle",
    };
  }

  private repositionPlanets() {
    const list = [...this.planets.values()];
    if (list.length === 0) return;
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2 + 20;
    if (list.length === 1) {
      list[0].container.setPosition(cx, cy);
      return;
    }
    const radius = Math.min(this.scale.width, this.scale.height) * 0.3;
    list.forEach((ref, i) => {
      const angle = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      ref.container.setPosition(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    });
  }
}

