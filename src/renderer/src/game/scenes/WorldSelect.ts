import * as Phaser from "phaser";
import { useStore } from "../../store";

type PlanetRef = {
  worldId: string;
  container: Phaser.GameObjects.Container;
  planet: Phaser.GameObjects.Arc;
  ring: Phaser.GameObjects.Arc;
  countText: Phaser.GameObjects.Text;
  labelText: Phaser.GameObjects.Text;
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
    const key = Object.keys(worlds).sort().map((k) => `${k}:${worlds[k].unitIds.length}`).join("|");
    if (ec !== this.lastEventCount || key !== this.lastWorldsKey) {
      this.lastEventCount = ec;
      this.lastWorldsKey = key;
      this.syncPlanets();
    }

    for (const ref of this.planets.values()) {
      ref.ring.rotation = this.t * 0.0015;
      const pulse = 1 + Math.sin(this.t * 0.004) * 0.04;
      ref.planet.setScale(pulse);
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
      }
    }
    for (const [id, ref] of this.planets) {
      if (!seen.has(id)) {
        ref.container.destroy(true);
        this.planets.delete(id);
      }
    }
    this.repositionPlanets();
  }

  private createPlanet(worldId: string, label: string, unitCount: number): PlanetRef {
    const palette = [0x4d7eff, 0x9d6bff, 0x6cc6ff, 0xffd86b, 0x7af0c0, 0xff6b8a];
    const color = palette[Math.abs(hash(worldId)) % palette.length];

    const ring = this.add.circle(0, 0, 58, 0x000000, 0).setStrokeStyle(1, 0xffd86b, 0.45);
    const planet = this.add.circle(0, 0, 38, color, 0.95).setStrokeStyle(2, 0xffffff, 0.6);
    const countText = this.add
      .text(0, 0, String(unitCount), { fontSize: "20px", color: "#04060d", fontStyle: "bold" })
      .setOrigin(0.5);
    const labelText = this.add
      .text(0, 62, label, { fontSize: "12px", color: "#e6ecff", fontFamily: "ui-monospace, monospace" })
      .setOrigin(0.5);

    // Invisible hit-pad — Phaser container hit-areas have alignment quirks
    // when the container has children at varied local positions. Putting an
    // explicit interactive circle on top is more reliable.
    const hitPad = this.add.circle(0, 0, 58, 0xffffff, 0);
    hitPad.setInteractive({ useHandCursor: true });
    hitPad.on("pointerover", () => {
      this.tweens.add({ targets: planet, scale: 1.12, duration: 120 });
      ring.setStrokeStyle(2, 0xffd86b, 0.9);
    });
    hitPad.on("pointerout", () => {
      this.tweens.add({ targets: planet, scale: 1, duration: 120 });
      ring.setStrokeStyle(1, 0xffd86b, 0.45);
    });
    hitPad.on("pointerdown", () => {
      useStore.getState().selectWorld(worldId);
    });

    const container = this.add.container(0, 0, [
      ring,
      planet,
      countText,
      labelText,
      hitPad,
    ]);

    return { worldId, container, planet, ring, countText, labelText };
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

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
