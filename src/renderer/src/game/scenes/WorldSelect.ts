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

export class WorldSelectScene extends Phaser.Scene {
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private emptyText: Phaser.GameObjects.Text | null = null;
  private stars: { circle: Phaser.GameObjects.Arc; speed: number }[] = [];
  private planets = new Map<string, PlanetRef>();
  private lastEventCount = -1;
  private lastWorldsKey = "";
  private t = 0;

  constructor() {
    super("worldSelect");
  }

  create() {
    this.cameras.main.setBackgroundColor("#04060d");
    this.spawnStars(110);

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

    this.scale.on("resize", () => this.layout());
    this.layout();

    this.events.once("shutdown", () => {
      this.planets.clear();
      this.stars = [];
      this.emptyText = null;
      this.lastEventCount = -1;
      this.lastWorldsKey = "";
    });
  }

  update(_time: number, delta: number) {
    this.t += delta;

    for (const star of this.stars) {
      star.circle.y += star.speed * (delta / 16);
      if (star.circle.y > this.scale.height) {
        star.circle.y = -2;
        star.circle.x = Math.random() * this.scale.width;
      }
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
    this.repositionPlanets();
  }

  private spawnStars(n: number) {
    for (let i = 0; i < n; i++) {
      const star = this.add.circle(
        Math.random() * this.scale.width,
        Math.random() * this.scale.height,
        Math.random() < 0.85 ? 1 : 2,
        0xffffff,
        0.4 + Math.random() * 0.5
      );
      this.stars.push({ circle: star, speed: 0.1 + Math.random() * 0.5 });
    }
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
    ref.alertLevel = level;
    const ringColor = ALERT_RING_COLOR[level];
    ref.ring.setStrokeStyle(1.4, ringColor, 0.55);
    // Dim idle worlds so dangerous ones grab the eye. The themed icon is
    // a Container — drop its alpha rather than recoloring primitives.
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

