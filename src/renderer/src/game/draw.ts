import Phaser from "phaser";
import type { UnitRole } from "@shared/events";

export const UNIT_ROLES: UnitRole[] = [
  "sora",
  "riku",
  "kairi",
  "donald",
  "goofy",
  "organization",
  "unversed",
];

export const SPRITE_URL = (role: UnitRole) => `/sprites/kh/${role}.png`;
export const TEXTURE_KEY = (role: UnitRole) => `kh-unit-${role}`;

const SKIN = 0xf5cba0;
const SKIN_DUCK = 0xfff8e0;
const SKIN_DOG = 0xc8a884;

/**
 * Chibi silhouettes — big head, smaller body, distinctive hair/hat.
 * All centered at (0,0); head is at y=-6, body at y=12, hair on top of head.
 * Total bounds roughly -22..14 vertical, -16..16 horizontal.
 */
export function drawKHUnit(
  scene: Phaser.Scene,
  role: UnitRole
): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];
  const stroke = (n: number, c = 0x000000, a = 0.7) => ({ width: n, color: c, alpha: a });

  switch (role) {
    case "sora": {
      // Body: red shirt with white sleeves
      objs.push(
        scene.add
          .rectangle(0, 12, 18, 14, 0xe74c3c)
          .setStrokeStyle(stroke(1.5).width, stroke(1.5).color, stroke(1.5).alpha)
      );
      objs.push(scene.add.rectangle(-10, 11, 6, 8, 0xffffff));
      objs.push(scene.add.rectangle(10, 11, 6, 8, 0xffffff));
      // Yellow shoes
      objs.push(scene.add.rectangle(-5, 19, 6, 4, 0xffd86b).setStrokeStyle(1, 0x000000, 0.6));
      objs.push(scene.add.rectangle(5, 19, 6, 4, 0xffd86b).setStrokeStyle(1, 0x000000, 0.6));
      // Crown necklace
      objs.push(scene.add.star(0, 5, 5, 1.6, 3.4, 0xffd86b).setStrokeStyle(0.8, 0x000000, 0.7));
      // Head (skin)
      objs.push(scene.add.circle(0, -4, 11, SKIN).setStrokeStyle(1, 0x3a2010, 0.8));
      // Spiky hair — many triangles forming a halo
      const hair = scene.add.graphics();
      hair.fillStyle(0x6b4423, 1);
      hair.lineStyle(1.2, 0x3d2814, 0.95);
      const spikes: [number, number, number, number, number, number][] = [
        [-13, -6, -7, -22, -2, -7],
        [-8, -6, -2, -24, 4, -7],
        [-2, -7, 4, -22, 8, -7],
        [4, -7, 12, -19, 12, -7],
        [-13, -3, -8, -10, -4, -3],
        [10, -3, 13, -10, 8, -3],
      ];
      spikes.forEach(([x1, y1, x2, y2, x3, y3]) => {
        hair.fillTriangle(x1, y1, x2, y2, x3, y3);
        hair.strokeTriangle(x1, y1, x2, y2, x3, y3);
      });
      hair.fillEllipse(0, -8, 18, 6);
      objs.push(hair);
      // Eyes (large chibi eyes)
      objs.push(scene.add.ellipse(-3.5, -3, 2.6, 3.4, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.ellipse(3.5, -3, 2.6, 3.4, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.circle(-3.5, -3, 1.1, 0x2c5e8a));
      objs.push(scene.add.circle(3.5, -3, 1.1, 0x2c5e8a));
      break;
    }
    case "riku": {
      // Body: dark blue/black with yellow accent
      objs.push(
        scene.add
          .rectangle(0, 12, 18, 14, 0x1a1a2e)
          .setStrokeStyle(1.5, 0xffffff, 0.6)
      );
      objs.push(scene.add.rectangle(0, 12, 1.6, 13, 0xffd86b));
      objs.push(scene.add.rectangle(-8, 19, 5, 3, 0xffffff));
      objs.push(scene.add.rectangle(8, 19, 5, 3, 0xffffff));
      // Head
      objs.push(scene.add.circle(0, -4, 11, SKIN).setStrokeStyle(1, 0x3a2010, 0.7));
      // Long silver hair — flows past shoulders, asymmetric flop
      const hair = scene.add.graphics();
      hair.fillStyle(0xe8e8ee, 1);
      hair.lineStyle(1, 0x808088, 0.9);
      // Top mass
      hair.fillEllipse(0, -12, 24, 12);
      // Side curtains
      hair.fillEllipse(-10, -2, 6, 16);
      hair.fillEllipse(10, -2, 6, 16);
      // Forehead bangs (asymmetric flop)
      hair.fillTriangle(-8, -8, 4, -6, -2, 2);
      hair.fillTriangle(2, -8, 10, -4, 6, 2);
      hair.strokeEllipse(0, -12, 24, 12);
      objs.push(hair);
      // Cyan eyes
      objs.push(scene.add.ellipse(-3.5, -3, 2.4, 3, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.ellipse(3.5, -3, 2.4, 3, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.circle(-3.5, -3, 1, 0x4ec9ff));
      objs.push(scene.add.circle(3.5, -3, 1, 0x4ec9ff));
      break;
    }
    case "kairi": {
      // Body: pink dress
      objs.push(
        scene.add
          .rectangle(0, 12, 18, 14, 0xff8aa8)
          .setStrokeStyle(1.5, 0xffffff, 0.7)
      );
      objs.push(scene.add.rectangle(0, 12, 18, 4, 0xa83a5d));
      objs.push(scene.add.rectangle(-7, 19, 5, 4, 0x222222));
      objs.push(scene.add.rectangle(7, 19, 5, 4, 0x222222));
      // Head
      objs.push(scene.add.circle(0, -4, 11, SKIN).setStrokeStyle(1, 0x3a2010, 0.7));
      // Auburn hair — short bob with side flips
      const hair = scene.add.graphics();
      hair.fillStyle(0xc44a2c, 1);
      hair.lineStyle(1, 0x6f1f10, 0.9);
      hair.fillEllipse(0, -10, 22, 14);
      hair.fillTriangle(-12, -2, -6, -8, -10, 6);
      hair.fillTriangle(12, -2, 6, -8, 10, 6);
      hair.strokeEllipse(0, -10, 22, 14);
      objs.push(hair);
      // Gold star clip
      objs.push(scene.add.star(8, -8, 5, 1.4, 2.8, 0xffd86b));
      // Eyes
      objs.push(scene.add.ellipse(-3.5, -3, 2.4, 3, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.ellipse(3.5, -3, 2.4, 3, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.circle(-3.5, -3, 1, 0x6b3c8f));
      objs.push(scene.add.circle(3.5, -3, 1, 0x6b3c8f));
      break;
    }
    case "donald": {
      // Body: blue sailor
      objs.push(
        scene.add
          .rectangle(0, 12, 16, 14, 0x4d7eff)
          .setStrokeStyle(1.2, 0xffffff, 0.8)
      );
      objs.push(scene.add.rectangle(0, 8, 16, 4, 0xffffff));
      objs.push(scene.add.rectangle(0, 6, 6, 3, 0xffd86b));
      // Head (white feathered)
      objs.push(scene.add.circle(0, -4, 12, SKIN_DUCK).setStrokeStyle(1, 0x000000, 0.7));
      // Sailor hat (blue trapezoid + stripe)
      const hat = scene.add.graphics();
      hat.fillStyle(0x4d7eff, 1);
      hat.lineStyle(1.2, 0xffffff, 1);
      hat.fillRect(-12, -14, 24, 5);
      hat.fillTriangle(-11, -14, 0, -22, 11, -14);
      hat.strokeTriangle(-11, -14, 0, -22, 11, -14);
      hat.strokeRect(-12, -14, 24, 5);
      // Pom on top
      hat.fillStyle(0xff3a3a, 1);
      hat.fillCircle(0, -22, 2.4);
      objs.push(hat);
      // Yellow beak
      objs.push(scene.add.triangle(0, 1, -6, -2, 6, -2, 0, 6, 0xffb733).setStrokeStyle(0.8, 0x804010, 0.8));
      objs.push(scene.add.line(0, 2, -5, 0, 5, 0, 0x804010).setLineWidth(0.8));
      // Eyes
      objs.push(scene.add.ellipse(-4, -7, 2.4, 3, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.ellipse(4, -7, 2.4, 3, 0xffffff).setStrokeStyle(0.8, 0x000000, 1));
      objs.push(scene.add.circle(-4, -7, 0.9, 0x000000));
      objs.push(scene.add.circle(4, -7, 0.9, 0x000000));
      break;
    }
    case "goofy": {
      // Body: orange shirt + green pants + blue hat collar
      objs.push(
        scene.add
          .rectangle(0, 9, 18, 8, 0xff9b3c)
          .setStrokeStyle(1, 0x000000, 0.6)
      );
      objs.push(scene.add.rectangle(0, 16, 18, 8, 0x4d7e3b).setStrokeStyle(1, 0x000000, 0.5));
      objs.push(scene.add.rectangle(-7, 21, 5, 3, 0x6b4423));
      objs.push(scene.add.rectangle(7, 21, 5, 3, 0x6b4423));
      // Head + long snout
      objs.push(scene.add.circle(0, -4, 11, SKIN_DOG).setStrokeStyle(1, 0x000000, 0.7));
      objs.push(scene.add.ellipse(0, 1, 16, 8, SKIN_DOG).setStrokeStyle(1, 0x000000, 0.6));
      // Big black nose
      objs.push(scene.add.ellipse(0, -1, 5, 3, 0x000000));
      // Floppy ears
      objs.push(scene.add.ellipse(-13, 2, 5, 14, SKIN_DOG).setStrokeStyle(1, 0x000000, 0.6));
      objs.push(scene.add.ellipse(13, 2, 5, 14, SKIN_DOG).setStrokeStyle(1, 0x000000, 0.6));
      // Tall green hat
      const hat = scene.add.graphics();
      hat.fillStyle(0x4d7e3b, 1);
      hat.lineStyle(1.2, 0x000000, 0.6);
      hat.fillEllipse(0, -10, 22, 6);
      hat.fillTriangle(-7, -10, 7, -10, 0, -22);
      hat.strokeTriangle(-7, -10, 7, -10, 0, -22);
      hat.strokeEllipse(0, -10, 22, 6);
      objs.push(hat);
      // Eyes
      objs.push(scene.add.circle(-3.5, -7, 1.6, 0xffffff).setStrokeStyle(0.6, 0x000000, 1));
      objs.push(scene.add.circle(3.5, -7, 1.6, 0xffffff).setStrokeStyle(0.6, 0x000000, 1));
      objs.push(scene.add.circle(-3.5, -7, 0.7, 0x000000));
      objs.push(scene.add.circle(3.5, -7, 0.7, 0x000000));
      break;
    }
    case "organization": {
      // Tall black hooded cloak, pointed hood up
      const cloak = scene.add.graphics();
      cloak.fillStyle(0x0a0a14, 1);
      cloak.lineStyle(1.3, 0x4d7eff, 0.7);
      cloak.fillTriangle(-14, 22, 14, 22, 0, -22);
      cloak.strokeTriangle(-14, 22, 14, 22, 0, -22);
      objs.push(cloak);
      // Hood inner shadow
      const hood = scene.add.graphics();
      hood.fillStyle(0x000000, 1);
      hood.fillEllipse(0, -7, 14, 12);
      objs.push(hood);
      // Glowing red eye in the void
      objs.push(scene.add.circle(0, -7, 2.5, 0xff3060, 0.85));
      objs.push(scene.add.circle(0, -7, 1, 0xffffff, 0.9));
      // Silver chain detail
      objs.push(scene.add.rectangle(0, 4, 2, 16, 0xc0c0c8, 0.6));
      break;
    }
    case "unversed": {
      // Spiked, jagged purple body with red claw outline
      const body = scene.add.graphics();
      body.fillStyle(0x4d2cc6, 1);
      body.lineStyle(1.6, 0xff3060, 1);
      const pts = [
        { x: 0, y: -22 },
        { x: 8, y: -14 },
        { x: 14, y: -2 },
        { x: 12, y: 10 },
        { x: 6, y: 20 },
        { x: -6, y: 20 },
        { x: -12, y: 10 },
        { x: -14, y: -2 },
        { x: -8, y: -14 },
      ];
      body.fillPoints(pts, true);
      body.strokePoints(pts, true, true);
      objs.push(body);
      // Glowing eye
      objs.push(scene.add.circle(0, -4, 3.5, 0xffd86b));
      objs.push(scene.add.circle(0, -4, 1.5, 0xff3060));
      // Mark of the Unversed (red emblem center body)
      objs.push(scene.add.star(0, 10, 3, 1.5, 4, 0xff3060, 0.8));
      break;
    }
  }
  return objs;
}

export function drawKHBuilding(
  scene: Phaser.Scene,
  kind: "disney" | "hollow" | "traverse",
  x: number,
  y: number
): Phaser.GameObjects.GameObject[] {
  const objs: Phaser.GameObjects.GameObject[] = [];
  switch (kind) {
    case "disney": {
      const base = scene.add
        .rectangle(x, y, 50, 18, 0x0a1130, 0.95)
        .setStrokeStyle(1, 0x6cc6ff, 0.5);
      const wall = scene.add
        .rectangle(x, y - 18, 30, 28, 0xeef7ff)
        .setStrokeStyle(1, 0x6cc6ff, 0.7);
      const door = scene.add.rectangle(x, y - 14, 9, 12, 0x4d7eff);
      const tower = scene.add
        .rectangle(x - 16, y - 32, 12, 30, 0x6cc6ff)
        .setStrokeStyle(1, 0xffffff, 0.7);
      const tower2 = scene.add
        .rectangle(x + 16, y - 32, 12, 30, 0x6cc6ff)
        .setStrokeStyle(1, 0xffffff, 0.7);
      const peakC = scene.add.triangle(x, y - 56, -18, 14, 18, 14, 0, -16, 0xffd86b);
      const peakL = scene.add.triangle(x - 16, y - 50, -8, 12, 8, 12, 0, -10, 0xffd86b);
      const peakR = scene.add.triangle(x + 16, y - 50, -8, 12, 8, 12, 0, -10, 0xffd86b);
      // Mickey ears
      const ear1 = scene.add.circle(x - 7, y - 72, 5, 0x000000).setStrokeStyle(1, 0xffd86b, 0.5);
      const earHead = scene.add.circle(x, y - 65, 6, 0x000000).setStrokeStyle(1, 0xffd86b, 0.5);
      const ear2 = scene.add.circle(x + 7, y - 72, 5, 0x000000).setStrokeStyle(1, 0xffd86b, 0.5);
      // Lit window
      const lamp = scene.add.circle(x, y - 14, 2, 0xffd86b);
      scene.tweens.add({
        targets: lamp,
        alpha: { from: 1, to: 0.3 },
        yoyo: true,
        repeat: -1,
        duration: 700,
      });
      objs.push(base, wall, door, tower, tower2, peakC, peakL, peakR, ear1, earHead, ear2, lamp);
      break;
    }
    case "hollow": {
      const base = scene.add
        .rectangle(x, y, 42, 16, 0x05080d, 1)
        .setStrokeStyle(1, 0xffd86b, 0.4);
      const wall = scene.add
        .rectangle(x, y - 16, 28, 26, 0x1a1426)
        .setStrokeStyle(1, 0x9d6bff, 0.7);
      const tower1 = scene.add
        .rectangle(x - 12, y - 36, 9, 28, 0x2a1f3a)
        .setStrokeStyle(1, 0x9d6bff, 0.6);
      const tower2 = scene.add
        .rectangle(x + 12, y - 32, 9, 22, 0x2a1f3a)
        .setStrokeStyle(1, 0x9d6bff, 0.6);
      const peak1 = scene.add.triangle(x - 12, y - 60, -8, 14, 8, 14, 0, -16, 0x9d6bff);
      const peak2 = scene.add.triangle(x + 12, y - 52, -7, 12, 7, 12, 0, -14, 0x9d6bff);
      const tallSpire = scene.add
        .rectangle(x, y - 52, 7, 40, 0x1a1426)
        .setStrokeStyle(1, 0xffd86b, 0.7);
      const tallPeak = scene.add.triangle(x, y - 78, -5, 6, 5, 6, 0, -8, 0xffd86b);
      // Keyhole
      const keyholeRing = scene.add
        .circle(x, y - 18, 4, 0x000000, 0)
        .setStrokeStyle(1.6, 0xffd86b, 1);
      const keyholeStem = scene.add.rectangle(x, y - 12, 2.5, 7, 0xffd86b);
      const lamp1 = scene.add.circle(x - 12, y - 36, 1.4, 0x9d6bff);
      const lamp2 = scene.add.circle(x + 12, y - 32, 1.4, 0x9d6bff);
      scene.tweens.add({
        targets: [lamp1, lamp2],
        alpha: { from: 1, to: 0.25 },
        yoyo: true,
        repeat: -1,
        duration: 900,
      });
      objs.push(
        base,
        wall,
        tower1,
        tower2,
        tallSpire,
        peak1,
        peak2,
        tallPeak,
        keyholeRing,
        keyholeStem,
        lamp1,
        lamp2
      );
      break;
    }
    case "traverse": {
      const base = scene.add
        .rectangle(x, y, 46, 14, 0x1a0f08, 1)
        .setStrokeStyle(1, 0xffd86b, 0.4);
      const left = scene.add
        .rectangle(x - 13, y - 16, 18, 24, 0x6b4423)
        .setStrokeStyle(1, 0xffd86b, 0.6);
      const right = scene.add
        .rectangle(x + 11, y - 14, 18, 20, 0x8a5530)
        .setStrokeStyle(1, 0xffd86b, 0.5);
      const roofL = scene.add.triangle(x - 13, y - 32, -11, 8, 11, 8, 0, -8, 0xff7a3c);
      const roofR = scene.add.triangle(x + 11, y - 26, -11, 6, 11, 6, 0, -8, 0xff7a3c);
      const lampPost = scene.add.rectangle(x + 21, y - 6, 1.6, 16, 0x444444);
      const lamp = scene.add.circle(x + 21, y - 16, 3, 0xffd86b);
      const window1 = scene.add.rectangle(x - 13, y - 16, 5, 5, 0xffd86b, 0.85);
      const window2 = scene.add.rectangle(x + 11, y - 14, 5, 5, 0xffd86b, 0.7);
      // Door
      const door = scene.add.rectangle(x - 13, y - 4, 5, 8, 0x3a2010);
      scene.tweens.add({
        targets: lamp,
        alpha: { from: 1, to: 0.5 },
        yoyo: true,
        repeat: -1,
        duration: 1200,
      });
      objs.push(base, left, right, roofL, roofR, lampPost, lamp, window1, window2, door);
      break;
    }
  }
  return objs;
}
