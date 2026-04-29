/**
 * Heartless mob rendering. Shadow chibi only for now — small black blob with
 * yellow round eyes and two crooked antennae. The visuals are deliberately
 * iconic so the player can read "enemy" instantly even at small zoom.
 *
 * The combat lifecycle (spawn → walk → attack → die) lives in KingdomScene;
 * this module is just primitives.
 */

import * as Phaser from "phaser";
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

export function drawShadow(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);

  // Body — pure black blob with subtle purple rim
  const body = scene.add.ellipse(0, 0, 22, 18, 0x05050a);
  body.setStrokeStyle(1.5, 0x3a1f5a, 0.85);
  c.add(body);

  // Hunched back hump
  const hump = scene.add.ellipse(0, -4, 18, 8, 0x0a0518);
  c.add(hump);

  // Two antennae — bent forward like little hooks
  const ant = scene.add.graphics();
  ant.lineStyle(1.5, 0x05050a, 1);
  ant.beginPath();
  ant.moveTo(-5, -7);
  ant.lineTo(-7, -14);
  ant.lineTo(-3, -16);
  ant.strokePath();
  ant.beginPath();
  ant.moveTo(5, -7);
  ant.lineTo(7, -14);
  ant.lineTo(3, -16);
  ant.strokePath();
  c.add(ant);

  // Yellow eyes — the only color, deliberately bright
  const eyeL = scene.add.circle(-4, -2, 1.8, 0xffd86b);
  const eyeR = scene.add.circle(4, -2, 1.8, 0xffd86b);
  eyeL.setStrokeStyle(0.6, 0x5a3a00, 1);
  eyeR.setStrokeStyle(0.6, 0x5a3a00, 1);
  c.add(eyeL);
  c.add(eyeR);

  // Tiny claws at the bottom
  const claws = scene.add.graphics();
  claws.lineStyle(1, 0x05050a, 1);
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
