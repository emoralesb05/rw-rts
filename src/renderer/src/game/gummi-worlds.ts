/**
 * Gummi-map planet art — each world renders as a tiny iconic silhouette of a
 * KH world rather than a flat colored disc. Themes are assigned by hashing
 * the worldId so the same repo always lands on the same world.
 *
 * The Container is centered at (0,0); the WorldSelectScene wraps it with an
 * alert ring, count text, label, heartless badge, and cleared star around it.
 */

import * as Phaser from "phaser";

export const WORLD_THEMES = [
  "disney",
  "hollow",
  "traverse",
  "destiny",
  "twilight",
  "halloween",
] as const;

export type WorldTheme = (typeof WORLD_THEMES)[number];

const THEME_BG: Record<WorldTheme, number> = {
  disney: 0x4d7eff,
  hollow: 0x4a2070,
  traverse: 0xff7a3c,
  destiny: 0x6cd5ff,
  twilight: 0xff89a3,
  halloween: 0x6b2bbf,
};

const THEME_LABEL: Record<WorldTheme, string> = {
  disney: "Disney Castle",
  hollow: "Hollow Bastion",
  traverse: "Traverse Town",
  destiny: "Destiny Islands",
  twilight: "Twilight Town",
  halloween: "Halloween Town",
};

export function themeFor(worldId: string): WorldTheme {
  let h = 0;
  for (let i = 0; i < worldId.length; i++) {
    h = (Math.imul(31, h) + worldId.charCodeAt(i)) | 0;
  }
  return WORLD_THEMES[Math.abs(h) % WORLD_THEMES.length];
}

export function themeBg(theme: WorldTheme): number {
  return THEME_BG[theme];
}

export function themeLabel(theme: WorldTheme): string {
  return THEME_LABEL[theme];
}

/**
 * Build a centered Container holding the world icon. The first child is the
 * atmosphere disc (so callers can read it back if they need to tint on alert
 * state). Everything else is the silhouette.
 */
export function drawGummiWorld(
  scene: Phaser.Scene,
  theme: WorldTheme
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  // Atmosphere disc — slightly larger than the silhouette, soft alpha so the
  // alert ring on the WorldSelectScene reads cleanly on top.
  const atm = scene.add.circle(0, 4, 36, THEME_BG[theme], 0.85);
  atm.setStrokeStyle(2, 0xffffff, 0.55);
  c.add(atm);

  switch (theme) {
    case "disney":
      drawDisney(scene, c);
      break;
    case "hollow":
      drawHollow(scene, c);
      break;
    case "traverse":
      drawTraverse(scene, c);
      break;
    case "destiny":
      drawDestiny(scene, c);
      break;
    case "twilight":
      drawTwilight(scene, c);
      break;
    case "halloween":
      drawHalloween(scene, c);
      break;
  }
  return c;
}

function drawDisney(scene: Phaser.Scene, c: Phaser.GameObjects.Container) {
  // Two side towers + tall central spire with Mickey-ear topper.
  const wall = scene.add
    .rectangle(0, 6, 20, 18, 0xeef7ff)
    .setStrokeStyle(1, 0x6cc6ff, 0.8);
  const door = scene.add.rectangle(0, 8, 5, 8, 0x4d7eff);
  const towerL = scene.add
    .rectangle(-11, -2, 8, 22, 0x9dc8ff)
    .setStrokeStyle(1, 0xffffff, 0.7);
  const towerR = scene.add
    .rectangle(11, -2, 8, 22, 0x9dc8ff)
    .setStrokeStyle(1, 0xffffff, 0.7);
  const peakL = scene.add.triangle(-11, -16, -5, 8, 5, 8, 0, -7, 0xffd86b);
  const peakR = scene.add.triangle(11, -16, -5, 8, 5, 8, 0, -7, 0xffd86b);
  const peakC = scene.add.triangle(0, -22, -8, 12, 8, 12, 0, -10, 0xffd86b);
  // Mickey-ear topper on central spire
  const ear1 = scene.add
    .circle(-4, -32, 2.6, 0x000000)
    .setStrokeStyle(0.8, 0xffd86b, 0.9);
  const earH = scene.add
    .circle(0, -28, 3.2, 0x000000)
    .setStrokeStyle(0.8, 0xffd86b, 0.9);
  const ear2 = scene.add
    .circle(4, -32, 2.6, 0x000000)
    .setStrokeStyle(0.8, 0xffd86b, 0.9);
  const lamp = scene.add.circle(0, 4, 1.2, 0xffd86b);
  scene.tweens.add({
    targets: lamp,
    alpha: { from: 1, to: 0.4 },
    yoyo: true,
    repeat: -1,
    duration: 700,
  });
  c.add([wall, door, towerL, towerR, peakL, peakR, peakC, ear1, earH, ear2, lamp]);
}

function drawHollow(scene: Phaser.Scene, c: Phaser.GameObjects.Container) {
  // Dark gothic castle: short tower + crooked spire + keyhole.
  const wall = scene.add
    .rectangle(0, 6, 20, 18, 0x1a1426)
    .setStrokeStyle(1, 0x9d6bff, 0.85);
  const towerL = scene.add
    .rectangle(-9, -4, 6, 22, 0x2a1f3a)
    .setStrokeStyle(1, 0x9d6bff, 0.7);
  const towerR = scene.add
    .rectangle(9, -2, 6, 18, 0x2a1f3a)
    .setStrokeStyle(1, 0x9d6bff, 0.7);
  const peakL = scene.add.triangle(-9, -19, -5, 9, 5, 9, 0, -10, 0x9d6bff);
  const peakR = scene.add.triangle(9, -14, -4, 7, 4, 7, 0, -8, 0x9d6bff);
  const tallSpire = scene.add
    .rectangle(0, -10, 5, 26, 0x1a1426)
    .setStrokeStyle(1, 0xffd86b, 0.9);
  const tallPeak = scene.add.triangle(0, -27, -3, 4, 3, 4, 0, -5, 0xffd86b);
  // Keyhole on wall
  const keyholeRing = scene.add
    .circle(0, 2, 2.6, 0x000000, 0)
    .setStrokeStyle(1.2, 0xffd86b, 1);
  const keyholeStem = scene.add.rectangle(0, 6, 1.6, 5, 0xffd86b);
  const lamp = scene.add.circle(-9, -4, 1.1, 0x9d6bff);
  scene.tweens.add({
    targets: lamp,
    alpha: { from: 1, to: 0.3 },
    yoyo: true,
    repeat: -1,
    duration: 900,
  });
  c.add([wall, towerL, towerR, peakL, peakR, tallSpire, tallPeak, keyholeRing, keyholeStem, lamp]);
}

function drawTraverse(scene: Phaser.Scene, c: Phaser.GameObjects.Container) {
  // Cluster of leaning shops + lamp post.
  const shopL = scene.add
    .rectangle(-9, 0, 14, 20, 0x6b4423)
    .setStrokeStyle(1, 0xffd86b, 0.85);
  const shopR = scene.add
    .rectangle(8, 2, 14, 16, 0x8a5530)
    .setStrokeStyle(1, 0xffd86b, 0.7);
  const roofL = scene.add.triangle(-9, -13, -8, 6, 8, 6, 0, -6, 0xff7a3c);
  const roofR = scene.add.triangle(8, -8, -8, 5, 8, 5, 0, -6, 0xff7a3c);
  const win1 = scene.add.rectangle(-9, 0, 4, 4, 0xffd86b, 0.95);
  const win2 = scene.add.rectangle(8, 2, 4, 4, 0xffd86b, 0.7);
  const lampPost = scene.add.rectangle(17, 4, 1.2, 14, 0x444444);
  const lamp = scene.add.circle(17, -4, 2.2, 0xffd86b);
  const door = scene.add.rectangle(-9, 8, 3, 6, 0x3a2010);
  scene.tweens.add({
    targets: lamp,
    alpha: { from: 1, to: 0.4 },
    yoyo: true,
    repeat: -1,
    duration: 1200,
  });
  c.add([shopL, shopR, roofL, roofR, win1, win2, lampPost, lamp, door]);
}

function drawDestiny(scene: Phaser.Scene, c: Phaser.GameObjects.Container) {
  // Sand island + paopu palm.
  const sand = scene.add.ellipse(0, 12, 36, 10, 0xf6d6a8);
  sand.setStrokeStyle(1, 0xc89a64, 0.85);
  // Curved palm trunk
  const trunk = scene.add.graphics();
  trunk.lineStyle(3, 0x6b4423, 1);
  trunk.beginPath();
  trunk.moveTo(2, 8);
  trunk.lineTo(0, -2);
  trunk.lineTo(-3, -14);
  trunk.strokePath();
  // Palm fronds — 5 leaves
  const frond = scene.add.graphics();
  frond.fillStyle(0x4caf50, 1);
  const frondPoints: [number, number][] = [
    [-3, -14],
    [-14, -18],
    [-12, -12],
  ];
  frond.fillTriangle(
    frondPoints[0][0],
    frondPoints[0][1],
    frondPoints[1][0],
    frondPoints[1][1],
    frondPoints[2][0],
    frondPoints[2][1]
  );
  frond.fillTriangle(-3, -14, 8, -20, 4, -12);
  frond.fillTriangle(-3, -14, -2, -22, 5, -18);
  frond.fillTriangle(-3, -14, -10, -10, -2, -10);
  frond.fillTriangle(-3, -14, 10, -14, 4, -10);
  // Paopu fruit (yellow star)
  const paopu = scene.add.star(7, -16, 5, 1.6, 3.6, 0xffd86b);
  paopu.setStrokeStyle(0.7, 0x000000, 0.8);
  // Tiny raft hint
  const raft = scene.add.rectangle(10, 12, 12, 3, 0x8a5530);
  c.add([sand, trunk, frond, paopu, raft]);
}

function drawTwilight(scene: Phaser.Scene, c: Phaser.GameObjects.Container) {
  // Tall clock tower silhouette against a pink atmosphere.
  const base = scene.add
    .rectangle(0, 8, 22, 12, 0x6b4423)
    .setStrokeStyle(1, 0xffd86b, 0.7);
  const tower = scene.add
    .rectangle(0, -6, 14, 24, 0xc8a884)
    .setStrokeStyle(1, 0xffd86b, 0.85);
  const peak = scene.add.triangle(0, -22, -9, 8, 9, 8, 0, -8, 0x8a5530);
  // Clock face
  const clockFace = scene.add.circle(0, -8, 5, 0xeef7ff);
  clockFace.setStrokeStyle(1, 0x000000, 1);
  const hourHand = scene.add.rectangle(0, -10, 1, 4, 0x000000);
  const minHand = scene.add.rectangle(1.5, -8, 3.5, 1, 0x000000);
  const center = scene.add.circle(0, -8, 0.8, 0x000000);
  // Glow halo (sunset)
  const halo = scene.add.circle(0, -22, 8, 0xffd86b, 0.35);
  scene.tweens.add({
    targets: halo,
    alpha: { from: 0.18, to: 0.45 },
    yoyo: true,
    repeat: -1,
    duration: 1400,
  });
  c.add([halo, base, tower, peak, clockFace, hourHand, minHand, center]);
}

function drawHalloween(scene: Phaser.Scene, c: Phaser.GameObjects.Container) {
  // Spiral hill + jack-o-lantern.
  const hill = scene.add.graphics();
  hill.fillStyle(0x2a1f3a, 1);
  hill.lineStyle(1, 0x6b2bbf, 0.9);
  hill.beginPath();
  hill.moveTo(-18, 12);
  hill.lineTo(-10, -8);
  hill.lineTo(-2, -18);
  hill.lineTo(2, -22);
  hill.lineTo(8, -12);
  hill.lineTo(14, -2);
  hill.lineTo(18, 12);
  hill.closePath();
  hill.fillPath();
  hill.strokePath();
  // Curl at the top
  const curl = scene.add.graphics();
  curl.lineStyle(1.4, 0xeae0c8, 0.9);
  curl.beginPath();
  curl.arc(2, -22, 4, Math.PI, Math.PI * 1.7, false);
  curl.strokePath();
  // Jack-o-lantern at the foot of the hill
  const pumpkin = scene.add.ellipse(8, 10, 14, 11, 0xff7a3c);
  pumpkin.setStrokeStyle(1, 0x000000, 0.95);
  const stem = scene.add.rectangle(8, 4, 2, 3, 0x4caf50);
  // Eyes + mouth
  const eyeL = scene.add.triangle(5, 9, -2, 2, 2, 2, 0, -2, 0xffd86b);
  const eyeR = scene.add.triangle(11, 9, -2, 2, 2, 2, 0, -2, 0xffd86b);
  const mouth = scene.add.rectangle(8, 13, 7, 1.2, 0xffd86b);
  // Twin moons / candles
  const flame = scene.add.circle(8, -2, 1.4, 0xffd86b);
  scene.tweens.add({
    targets: flame,
    alpha: { from: 1, to: 0.4 },
    yoyo: true,
    repeat: -1,
    duration: 600,
  });
  c.add([hill, curl, pumpkin, stem, eyeL, eyeR, mouth, flame]);
}
