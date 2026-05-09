/**
 * Heartless mob rendering. Shadow chibi only for now — small black blob with
 * yellow round eyes and two crooked antennae. The visuals are deliberately
 * iconic so the player can read "enemy" instantly even at small zoom.
 *
 * The combat lifecycle (spawn → walk → attack → die) lives in KingdomScene;
 * this module is just primitives.
 */

import type * as Phaser from "phaser";
import type { HeartlessType } from "@shared/events";

export type HeartlessRef = {
  id: string;
  type: HeartlessType;
  targetUnitId?: string;
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  shadow: Phaser.GameObjects.Ellipse;
  bobOffset: number;
  lastLungeAt: number;
};

export function drawShadow(
  scene: Phaser.Scene,
  type: HeartlessType = "shadow"
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const large = type === "large_body";
  const soldier = type === "soldier";
  const bodyW = large ? 30 : soldier ? 24 : 22;
  const bodyH = large ? 25 : soldier ? 22 : 18;
  const rim = large ? 0xffb86c : soldier ? 0x6cc6ff : 0x3a1f5a;

  // Body — pure black blob with subtle purple rim
  const body = scene.add.ellipse(0, 0, bodyW, bodyH, 0x05050a);
  body.setStrokeStyle(1.5, rim, 0.85);
  c.add(body);

  // Hunched back hump
  const hump = scene.add.ellipse(
    0,
    large ? -7 : -4,
    bodyW - 4,
    large ? 12 : 8,
    0x0a0518
  );
  c.add(hump);

  if (large) {
    const belly = scene.add
      .ellipse(0, 3, 19, 15, 0x15111f, 0.95)
      .setStrokeStyle(1.1, 0xffd86b, 0.55);
    c.add(belly);
  } else if (soldier) {
    const helm = scene.add
      .triangle(0, -11, -9, 7, 9, 7, 0, -7, 0x14101f)
      .setStrokeStyle(1, 0x6cc6ff, 0.62);
    c.add(helm);
  }

  // Two antennae — bent forward like little hooks
  const ant = scene.add.graphics();
  ant.lineStyle(large ? 2 : 1.5, 0x05050a, 1);
  ant.beginPath();
  ant.moveTo(-5, large ? -11 : -7);
  ant.lineTo(-8, large ? -20 : -14);
  ant.lineTo(-3, large ? -22 : -16);
  ant.strokePath();
  ant.beginPath();
  ant.moveTo(5, large ? -11 : -7);
  ant.lineTo(8, large ? -20 : -14);
  ant.lineTo(3, large ? -22 : -16);
  ant.strokePath();
  c.add(ant);

  // Yellow eyes — the only color, deliberately bright
  const eyeY = large ? -3 : -2;
  const eyeL = scene.add.circle(
    large ? -5 : -4,
    eyeY,
    large ? 2.1 : 1.8,
    0xffd86b
  );
  const eyeR = scene.add.circle(
    large ? 5 : 4,
    eyeY,
    large ? 2.1 : 1.8,
    0xffd86b
  );
  eyeL.setStrokeStyle(0.6, 0x5a3a00, 1);
  eyeR.setStrokeStyle(0.6, 0x5a3a00, 1);
  c.add(eyeL);
  c.add(eyeR);

  // Tiny claws at the bottom
  const claws = scene.add.graphics();
  claws.lineStyle(soldier ? 1.4 : 1, 0x05050a, 1);
  claws.beginPath();
  claws.moveTo(-9, 7);
  claws.lineTo(-11, 10);
  claws.moveTo(-6, 8);
  claws.lineTo(-7, 11);
  claws.moveTo(6, 8);
  claws.lineTo(7, 11);
  claws.moveTo(9, 7);
  claws.lineTo(11, 10);
  claws.strokePath();
  c.add(claws);

  return c;
}
