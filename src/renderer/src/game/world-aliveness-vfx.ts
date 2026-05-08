import type * as Phaser from "phaser";
import type { WorldActivityKind } from "./world-aliveness";

export function drawActivityGlyph(
  g: Phaser.GameObjects.Graphics,
  kind: WorldActivityKind,
  color: number
) {
  g.clear();
  g.lineStyle(2, color, 0.92);
  g.fillStyle(color, 0.16);
  switch (kind) {
    case "shell":
      g.fillRect(-15, -10, 30, 20);
      g.strokeRect(-15, -10, 30, 20);
      g.beginPath();
      g.moveTo(-9, -2);
      g.lineTo(-4, 2);
      g.lineTo(-9, 6);
      g.moveTo(0, 6);
      g.lineTo(8, 6);
      g.strokePath();
      break;
    case "read":
      g.fillRect(-12, -13, 24, 26);
      g.strokeRect(-12, -13, 24, 26);
      g.lineStyle(1.4, color, 0.82);
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(-7, -6 + i * 5);
        g.lineTo(7, -6 + i * 5);
        g.strokePath();
      }
      break;
    case "edit":
      g.lineStyle(3, color, 0.95);
      g.beginPath();
      g.moveTo(-14, 10);
      g.lineTo(14, -10);
      g.strokePath();
      g.fillStyle(0xfff4c7, 0.92);
      g.fillCircle(12, -10, 2.5);
      g.fillCircle(-10, 8, 1.8);
      break;
    case "search":
      g.strokeCircle(-3, -3, 9);
      g.beginPath();
      g.moveTo(5, 5);
      g.lineTo(14, 14);
      g.strokePath();
      g.lineStyle(1, color, 0.4);
      g.strokeCircle(-3, -3, 17);
      break;
    case "web":
      g.strokeCircle(0, 0, 15);
      g.lineStyle(1.4, color, 0.7);
      g.beginPath();
      g.moveTo(-15, 0);
      g.lineTo(15, 0);
      g.moveTo(0, -15);
      g.lineTo(0, 15);
      g.strokePath();
      g.strokeCircle(0, 0, 7);
      break;
    case "permission":
      drawDiamond(g, color, 15);
      g.lineStyle(2, color, 0.95);
      g.beginPath();
      g.moveTo(0, -7);
      g.lineTo(0, 2);
      g.strokePath();
      g.fillCircle(0, 8, 1.7);
      break;
    case "error":
      drawDiamond(g, color, 16);
      g.lineStyle(2.2, color, 1);
      g.beginPath();
      g.moveTo(-4, -9);
      g.lineTo(2, -2);
      g.lineTo(-2, 4);
      g.lineTo(5, 11);
      g.strokePath();
      break;
    case "success":
      g.strokeCircle(0, 0, 14);
      g.lineStyle(2.4, color, 0.95);
      g.beginPath();
      g.moveTo(-8, 0);
      g.lineTo(-2, 7);
      g.lineTo(10, -7);
      g.strokePath();
      break;
    case "subagent":
      drawDiamond(g, color, 16);
      g.lineStyle(1.6, color, 0.85);
      g.strokeCircle(0, 0, 8);
      g.fillStyle(color, 0.9);
      g.fillCircle(0, 0, 2);
      break;
    case "prompt":
      g.strokeRect(-14, -10, 28, 20);
      g.beginPath();
      g.moveTo(-7, -3);
      g.lineTo(-1, 0);
      g.lineTo(-7, 3);
      g.moveTo(2, 4);
      g.lineTo(9, 4);
      g.strokePath();
      break;
    case "generic":
      g.strokeCircle(0, 0, 13);
      g.lineStyle(1.4, color, 0.85);
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(0, 16);
      g.moveTo(-16, 0);
      g.lineTo(16, 0);
      g.strokePath();
      break;
  }
}

function drawDiamond(
  g: Phaser.GameObjects.Graphics,
  color: number,
  radius: number
) {
  g.fillStyle(color, 0.14);
  g.lineStyle(2, color, 0.9);
  g.beginPath();
  g.moveTo(0, -radius);
  g.lineTo(radius, 0);
  g.lineTo(0, radius);
  g.lineTo(-radius, 0);
  g.closePath();
  g.fillPath();
  g.strokePath();
}
