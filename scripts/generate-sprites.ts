/**
 * Sprite PNG generator. Produces two outputs per role into
 * `assets/sprites/kh-default/`:
 *
 *   - <role>.png        — single 96×128 still frame (idle pose)
 *   - <role>_sheet.png  — 768×128 spritesheet of 8 horizontal frames
 *                         frames 0..3 = idle (subtle breathing bob)
 *                         frames 4..7 = swing (windup → strike → peak → recover)
 *
 * Original chibi art — same shape vocabulary as src/renderer/src/game/draw.ts
 * but rendered at 4× resolution with cell-shading, drop shadows, eye
 * highlights, and per-frame transforms for animation.
 *
 * Run: bun scripts/generate-sprites.ts
 */
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type Role =
  | "sora" | "riku" | "kairi" | "donald" | "goofy" | "mickey"
  | "ventus" | "aqua" | "terra" | "roxas" | "namine"
  | "cloud" | "leon" | "tifa" | "aerith" | "yuffie"
  | "organization" | "unversed";

const ROLES: Role[] = [
  "sora", "riku", "kairi", "donald", "goofy", "mickey",
  "ventus", "aqua", "terra", "roxas", "namine",
  "cloud", "leon", "tifa", "aerith", "yuffie",
  "organization", "unversed",
];

// Logical drawing area is 24×32 (matches src/renderer/src/game/draw.ts
// coordinate space). At SCALE=4 each frame is 96×128 px.
const SCALE = 4;
const FRAME_W = 24 * SCALE;
const FRAME_H = 32 * SCALE;
const FRAMES = 8;

const SKIN = "#f5cba0";
const SKIN_DUCK = "#fff8e0";
const SKIN_DOG = "#c8a884";

// ----- low-level shape helpers -----------------------------------------------

type Stroke = { color: string; width: number; alpha?: number };

function darken(hex: string, amt = 0.25): string {
  const c = hex.replace("#", "");
  const r = Math.max(0, Math.floor(parseInt(c.slice(0, 2), 16) * (1 - amt)));
  const g = Math.max(0, Math.floor(parseInt(c.slice(2, 4), 16) * (1 - amt)));
  const b = Math.max(0, Math.floor(parseInt(c.slice(4, 6), 16) * (1 - amt)));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function applyStroke(ctx: SKRSContext2D, s?: Stroke) {
  if (!s) return;
  ctx.save();
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.strokeStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.stroke();
  ctx.restore();
}

// Cell-shaded fill: paints the base color, then a darker shadow on the bottom-
// right ~40%. Implemented via a clipped second pass.
function shadedFill(ctx: SKRSContext2D, drawShape: () => void, base: string, shaded = true) {
  drawShape();
  ctx.fillStyle = base;
  ctx.fill();
  if (!shaded) return;
  ctx.save();
  drawShape();
  ctx.clip();
  ctx.fillStyle = darken(base, 0.22);
  ctx.beginPath();
  ctx.moveTo(-100, 100);
  ctx.lineTo(100, 100);
  ctx.lineTo(100, -100);
  ctx.lineTo(-30, 100);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function rect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: Stroke, shaded = true) {
  shadedFill(ctx, () => {
    ctx.beginPath();
    ctx.rect(x - w / 2, y - h / 2, w, h);
  }, fill, shaded);
  ctx.beginPath();
  ctx.rect(x - w / 2, y - h / 2, w, h);
  applyStroke(ctx, stroke);
}

function circle(ctx: SKRSContext2D, x: number, y: number, r: number, fill: string, stroke?: Stroke, shaded = true) {
  shadedFill(ctx, () => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }, fill, shaded);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  applyStroke(ctx, stroke);
}

function ellipse(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, fill: string, stroke?: Stroke, shaded = true) {
  shadedFill(ctx, () => {
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  }, fill, shaded);
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
  applyStroke(ctx, stroke);
}

function tri(ctx: SKRSContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, fill: string, stroke?: Stroke, shaded = true) {
  shadedFill(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
  }, fill, shaded);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  applyStroke(ctx, stroke);
}

function poly(ctx: SKRSContext2D, points: [number, number][], fill: string, stroke?: Stroke, shaded = true) {
  shadedFill(ctx, () => {
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
  }, fill, shaded);
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  applyStroke(ctx, stroke);
}

function star(ctx: SKRSContext2D, cx: number, cy: number, points: number, inner: number, outer: number, fill: string, stroke?: Stroke) {
  const pts: [number, number][] = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = i * step - Math.PI / 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  poly(ctx, pts, fill, stroke, false);
}

const OUTLINE = (alpha = 0.9): Stroke => ({ color: "#000000", width: 0.6, alpha });

// Eye with highlight — chibi convention.
function eye(ctx: SKRSContext2D, x: number, y: number, pupil: string) {
  ellipse(ctx, x, y, 2.6, 3.4, "#ffffff", { color: "#000000", width: 0.4 }, false);
  circle(ctx, x, y + 0.3, 1.1, pupil, undefined, false);
  // small white highlight
  circle(ctx, x - 0.6, y - 0.7, 0.5, "#ffffff", undefined, false);
}

// ----- per-role drawings -----------------------------------------------------

function drawSora(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#e74c3c", { color: "#9b1f0f", width: 0.6 });
  rect(ctx, -10, 3, 6, 8, "#ffffff", OUTLINE(0.4));
  rect(ctx, 10, 3, 6, 8, "#ffffff", OUTLINE(0.4));
  rect(ctx, -5, 11, 6, 4, "#ffd86b", OUTLINE(0.6));
  rect(ctx, 5, 11, 6, 4, "#ffd86b", OUTLINE(0.6));
  star(ctx, 0, -3, 5, 1.2, 2.6, "#ffd86b", OUTLINE(0.6));
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.6 });
  ellipse(ctx, 0, -16, 18, 6, "#6b4423", undefined, false);
  tri(ctx, -13, -14, -7, -28, -2, -15, "#6b4423", { color: "#3d2814", width: 0.5 });
  tri(ctx, -8, -14, -2, -32, 4, -15, "#6b4423", { color: "#3d2814", width: 0.5 });
  tri(ctx, -2, -15, 4, -28, 8, -15, "#6b4423", { color: "#3d2814", width: 0.5 });
  tri(ctx, 4, -15, 12, -27, 12, -15, "#6b4423", { color: "#3d2814", width: 0.5 });
  tri(ctx, -13, -11, -8, -18, -4, -11, "#6b4423", { color: "#3d2814", width: 0.5 });
  tri(ctx, 10, -11, 13, -18, 8, -11, "#6b4423", { color: "#3d2814", width: 0.5 });
  eye(ctx, -3.5, -11, "#2c5e8a");
  eye(ctx, 3.5, -11, "#2c5e8a");
}

function drawRiku(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#1a1a2e", { color: "#000000", width: 0.6 });
  rect(ctx, 0, 4, 1.6, 18, "#ffd86b", undefined, false);
  rect(ctx, -8, 12, 5, 3, "#ffffff", OUTLINE(0.5));
  rect(ctx, 8, 12, 5, 3, "#ffffff", OUTLINE(0.5));
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 24, 12, "#e8e8ee", { color: "#808088", width: 0.5 });
  ellipse(ctx, -10, -8, 6, 16, "#e8e8ee", undefined, false);
  ellipse(ctx, 10, -8, 6, 16, "#e8e8ee", undefined, false);
  tri(ctx, -8, -16, 4, -14, -2, -8, "#e8e8ee", undefined, false);
  tri(ctx, 2, -16, 10, -12, 6, -8, "#e8e8ee", undefined, false);
  eye(ctx, -3.5, -12, "#4ec9ff");
  eye(ctx, 3.5, -12, "#4ec9ff");
}

function drawKairi(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#ff8aa8", { color: "#a83a5d", width: 0.6 });
  rect(ctx, 0, 4, 18, 4, "#a83a5d", undefined, false);
  rect(ctx, -7, 11, 5, 4, "#222222", OUTLINE(0.6));
  rect(ctx, 7, 11, 5, 4, "#222222", OUTLINE(0.6));
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -16, 22, 14, "#c44a2c", { color: "#6f1f10", width: 0.5 });
  tri(ctx, -12, -8, -6, -16, -10, -2, "#c44a2c", undefined, false);
  tri(ctx, 12, -8, 6, -16, 10, -2, "#c44a2c", undefined, false);
  star(ctx, 8, -16, 5, 1.1, 2.4, "#ffd86b", OUTLINE(0.6));
  eye(ctx, -3.5, -12, "#6b3c8f");
  eye(ctx, 3.5, -12, "#6b3c8f");
}

function drawDonald(ctx: SKRSContext2D) {
  rect(ctx, 0, 6, 16, 18, "#4d7eff", { color: "#ffffff", width: 0.5 });
  rect(ctx, 0, 0, 16, 4, "#ffffff", undefined, false);
  rect(ctx, 0, -2, 6, 3, "#ffd86b", undefined, false);
  circle(ctx, 0, -12, 12, SKIN_DUCK, { color: "#000000", width: 0.5 });
  rect(ctx, 0, -22, 24, 5, "#4d7eff", { color: "#ffffff", width: 0.5 });
  tri(ctx, -11, -22, 0, -30, 11, -22, "#4d7eff", { color: "#ffffff", width: 0.5 });
  circle(ctx, 0, -30, 2.4, "#ff3a3a", undefined, false);
  poly(ctx, [[-6, -10], [6, -10], [0, -4]], "#ffb733", { color: "#804010", width: 0.4 });
  eye(ctx, -4, -15, "#000000");
  eye(ctx, 4, -15, "#000000");
}

function drawGoofy(ctx: SKRSContext2D) {
  rect(ctx, 0, 1, 18, 14, "#ff9b3c", { color: "#7a4720", width: 0.5 });
  rect(ctx, 0, 8, 18, 8, "#4d7e3b", { color: "#1f3a1a", width: 0.5 });
  rect(ctx, -7, 13, 5, 3, "#6b4423", undefined, false);
  rect(ctx, 7, 13, 5, 3, "#6b4423", undefined, false);
  circle(ctx, 0, -12, 11, SKIN_DOG, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -7, 16, 8, SKIN_DOG, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -9, 5, 3, "#000000", undefined, false);
  ellipse(ctx, -13, -6, 5, 14, SKIN_DOG, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 13, -6, 5, 14, SKIN_DOG, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 22, 6, "#4d7e3b", { color: "#1f3a1a", width: 0.5 });
  rect(ctx, 0, -22, 14, 8, "#4d7e3b", { color: "#1f3a1a", width: 0.5 });
  eye(ctx, -3.5, -15, "#000000");
  eye(ctx, 3.5, -15, "#000000");
}

function drawMickey(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 16, 14, "#111111", { color: "#ffd86b", width: 0.6 });
  rect(ctx, -7, 11, 5, 3, "#ffd86b", undefined, false);
  rect(ctx, 7, 11, 5, 3, "#ffd86b", undefined, false);
  circle(ctx, 0, -12, 11, "#e6b187", { color: "#000000", width: 0.5 });
  circle(ctx, -9, -24, 7, "#111111", { color: "#ffffff", width: 0.4 });
  circle(ctx, 9, -24, 7, "#111111", { color: "#ffffff", width: 0.4 });
  eye(ctx, -3.5, -12, "#000000");
  eye(ctx, 3.5, -12, "#000000");
  circle(ctx, 0, -7, 1.6, "#000000", undefined, false);
}

function drawVentus(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#fff4a6", { color: "#a18920", width: 0.5 });
  rect(ctx, 0, 4, 1.4, 14, "#808080", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -15, 22, 6, "#e9d24a", undefined, false);
  tri(ctx, -12, -14, -3, -28, -2, -15, "#e9d24a", { color: "#a78a26", width: 0.5 });
  tri(ctx, -5, -14, 2, -28, 6, -15, "#e9d24a", { color: "#a78a26", width: 0.5 });
  tri(ctx, 3, -14, 12, -26, 11, -15, "#e9d24a", { color: "#a78a26", width: 0.5 });
  eye(ctx, -3.5, -11, "#4ec9ff");
  eye(ctx, 3.5, -11, "#4ec9ff");
}

function drawAqua(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#4ec9ff", { color: "#1a4d7a", width: 0.5 });
  rect(ctx, 0, 4, 16, 4, "#2080c8", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 22, 12, "#4ec9ff", { color: "#2a7aab", width: 0.5 });
  ellipse(ctx, -9, -10, 5, 12, "#4ec9ff", undefined, false);
  ellipse(ctx, 9, -10, 5, 12, "#4ec9ff", undefined, false);
  tri(ctx, -8, -16, 0, -10, -2, -15, "#4ec9ff", undefined, false);
  tri(ctx, 8, -16, 0, -10, 2, -15, "#4ec9ff", undefined, false);
  eye(ctx, -3.5, -11, "#4ec9ff");
  eye(ctx, 3.5, -11, "#4ec9ff");
}

function drawTerra(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 20, 24, "#9c6638", { color: "#3d2814", width: 0.6 });
  rect(ctx, 0, 12, 18, 6, "#5d3a1f", undefined, false);
  circle(ctx, 0, -12, 12, SKIN, { color: "#3a2010", width: 0.6 });
  ellipse(ctx, 0, -18, 24, 10, "#6b4423", { color: "#3d2814", width: 0.5 });
  tri(ctx, -10, -18, 4, -24, -2, -16, "#6b4423", undefined, false);
  tri(ctx, 10, -18, -4, -24, 2, -16, "#6b4423", undefined, false);
  eye(ctx, -3.5, -11, "#6b4423");
  eye(ctx, 3.5, -11, "#6b4423");
}

function drawRoxas(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#0a0a14", { color: "#000000", width: 0.6 });
  rect(ctx, 0, 4, 1.6, 14, "#ffd86b", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -15, 22, 6, "#eae0a8", undefined, false);
  tri(ctx, -12, -14, -3, -30, -2, -15, "#eae0a8", { color: "#b4a55a", width: 0.5 });
  tri(ctx, -5, -14, 2, -32, 6, -15, "#eae0a8", { color: "#b4a55a", width: 0.5 });
  tri(ctx, 3, -14, 12, -28, 11, -15, "#eae0a8", { color: "#b4a55a", width: 0.5 });
  eye(ctx, -3.5, -11, "#4ec9ff");
  eye(ctx, 3.5, -11, "#4ec9ff");
}

function drawNamine(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 24, "#ffffff", { color: "#c06090", width: 0.5 });
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 22, 12, "#f2e7b9", { color: "#9a8a4a", width: 0.4 });
  ellipse(ctx, -10, -4, 6, 22, "#f2e7b9", undefined, false);
  ellipse(ctx, 10, -4, 6, 22, "#f2e7b9", undefined, false);
  tri(ctx, -8, -16, 4, -14, -2, -8, "#f2e7b9", undefined, false);
  tri(ctx, 2, -16, 10, -14, 6, -8, "#f2e7b9", undefined, false);
  eye(ctx, -3.5, -11, "#4ec9ff");
  eye(ctx, 3.5, -11, "#4ec9ff");
}

function drawCloud(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 24, "#2a3a5e", { color: "#0d1428", width: 0.6 });
  rect(ctx, -9, 4, 4, 14, "#4a5a7e", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -16, 24, 6, "#e9d24a", undefined, false);
  tri(ctx, -13, -14, -4, -34, -2, -15, "#e9d24a", { color: "#a78a26", width: 0.6 });
  tri(ctx, -6, -14, 0, -36, 6, -15, "#e9d24a", { color: "#a78a26", width: 0.6 });
  tri(ctx, 2, -14, 8, -34, 12, -15, "#e9d24a", { color: "#a78a26", width: 0.6 });
  tri(ctx, 8, -16, 14, -30, 12, -15, "#e9d24a", { color: "#a78a26", width: 0.6 });
  eye(ctx, -3.5, -11, "#4ec9ff");
  eye(ctx, 3.5, -11, "#4ec9ff");
}

function drawLeon(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 24, "#1a1a22", { color: "#000000", width: 0.5 });
  rect(ctx, 0, 4, 16, 3, "#ffffff", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 22, 10, "#6b4423", { color: "#3d2814", width: 0.5 });
  tri(ctx, -10, -16, 6, -22, -2, -14, "#6b4423", undefined, false);
  ctx.save();
  ctx.strokeStyle = "#a83a3a";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(-2, -10);
  ctx.lineTo(4, -7);
  ctx.stroke();
  ctx.restore();
  eye(ctx, -3.5, -11, "#2a5a8a");
  eye(ctx, 3.5, -11, "#2a5a8a");
}

function drawTifa(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#ffffff", { color: "#3a3a3a", width: 0.5 });
  rect(ctx, 0, 8, 16, 6, "#111111", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 22, 14, "#111111", undefined, false);
  ellipse(ctx, -10, -2, 6, 24, "#111111", undefined, false);
  ellipse(ctx, 10, -2, 6, 24, "#111111", undefined, false);
  tri(ctx, -8, -16, 4, -14, -2, -6, "#111111", undefined, false);
  tri(ctx, 2, -16, 10, -14, 6, -6, "#111111", undefined, false);
  eye(ctx, -3.5, -11, "#a83a5d");
  eye(ctx, 3.5, -11, "#a83a5d");
}

function drawAerith(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 24, "#ff89a3", { color: "#a83a5d", width: 0.5 });
  rect(ctx, 0, 5, 18, 3, "#b4566a", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 22, 10, "#8a5530", { color: "#3d2814", width: 0.5 });
  ellipse(ctx, 0, 4, 6, 22, "#8a5530", undefined, false);
  tri(ctx, -8, -16, 4, -14, -2, -8, "#8a5530", undefined, false);
  tri(ctx, 2, -16, 10, -14, 6, -8, "#8a5530", undefined, false);
  rect(ctx, 0, -16, 18, 2, "#ff89a3", undefined, false);
  eye(ctx, -3.5, -11, "#6cd17a");
  eye(ctx, 3.5, -11, "#6cd17a");
}

function drawYuffie(ctx: SKRSContext2D) {
  rect(ctx, 0, 4, 18, 22, "#6cd17a", { color: "#2a5a35", width: 0.5 });
  rect(ctx, 0, 8, 16, 4, "#ffd86b", undefined, false);
  circle(ctx, 0, -12, 11, SKIN, { color: "#3a2010", width: 0.5 });
  ellipse(ctx, 0, -18, 22, 10, "#1a1a22", undefined, false);
  tri(ctx, -10, -16, 4, -22, -2, -14, "#1a1a22", undefined, false);
  tri(ctx, 10, -16, -4, -22, 2, -14, "#1a1a22", undefined, false);
  rect(ctx, 0, -18, 22, 2, "#ffd86b", undefined, false);
  eye(ctx, -3.5, -11, "#111111");
  eye(ctx, 3.5, -11, "#111111");
}

function drawOrganization(ctx: SKRSContext2D) {
  poly(ctx, [[-13, 14], [13, 14], [0, -22]], "#0a0a14", { color: "#4d7eff", width: 0.6, alpha: 0.6 });
  ellipse(ctx, 0, -8, 14, 10, "#000000", undefined, false);
  circle(ctx, 0, -8, 2.5, "#ff3060", undefined, false);
  circle(ctx, -0.6, -8.6, 0.6, "#ffffff", undefined, false);
  rect(ctx, 0, 4, 2, 16, "#c0c0c8", undefined, false);
}

function drawUnversed(ctx: SKRSContext2D) {
  poly(ctx, [
    [0, -22],
    [9, -14],
    [12, -2],
    [10, 10],
    [6, 20],
    [-6, 20],
    [-10, 10],
    [-12, -2],
    [-9, -14],
  ], "#4d2cc6", { color: "#ff3060", width: 0.7 });
  circle(ctx, 0, -4, 3.5, "#ffd86b", undefined, false);
  circle(ctx, 0, -4, 1.5, "#ff3060", undefined, false);
  star(ctx, 0, 10, 5, 1.4, 3.4, "#ff3060");
}

const DRAWERS: Record<Role, (ctx: SKRSContext2D) => void> = {
  sora: drawSora, riku: drawRiku, kairi: drawKairi, donald: drawDonald,
  goofy: drawGoofy, mickey: drawMickey, ventus: drawVentus, aqua: drawAqua,
  terra: drawTerra, roxas: drawRoxas, namine: drawNamine, cloud: drawCloud,
  leon: drawLeon, tifa: drawTifa, aerith: drawAerith, yuffie: drawYuffie,
  organization: drawOrganization, unversed: drawUnversed,
};

// ----- shared chrome (shadow under feet) -------------------------------------

function drawShadow(ctx: SKRSContext2D) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 16, 9, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ----- frame transforms ------------------------------------------------------

// Frames 0..3 idle bob (sin), 4..7 swing (windup → strike → peak → recover).
function applyFrameTransform(ctx: SKRSContext2D, frame: number) {
  if (frame < 4) {
    // idle bob: y goes 0,-1,0,+1
    const seq = [0, -1, 0, 1];
    ctx.translate(0, seq[frame]);
  } else {
    // swing: rotate (about head pivot, roughly y=-4)
    const seqDeg = [-12, 18, 28, 6];
    const deg = seqDeg[frame - 4];
    ctx.translate(0, -4);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.translate(0, 4);
  }
}

// ----- canvas + sheet rendering ----------------------------------------------

function newCanvasFor(role: Role, frames: number) {
  const canvas = createCanvas(FRAME_W * frames, FRAME_H);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  return { canvas, ctx, role };
}

function renderFrameAt(
  ctx: SKRSContext2D,
  role: Role,
  frame: number,
  slotX: number
) {
  // 1. shadow stays put
  ctx.save();
  ctx.translate(slotX + FRAME_W / 2, FRAME_H / 2);
  ctx.scale(SCALE, SCALE);
  drawShadow(ctx);
  ctx.restore();

  // 2. character with frame transform
  ctx.save();
  ctx.translate(slotX + FRAME_W / 2, FRAME_H / 2);
  ctx.scale(SCALE, SCALE);
  applyFrameTransform(ctx, frame);
  DRAWERS[role](ctx);
  ctx.restore();
}

const OUT_DIR = resolve(import.meta.dirname, "..", "assets", "sprites", "kh-default");

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const role of ROLES) {
    // Single still — frame 0 only, no transform
    {
      const { canvas, ctx } = newCanvasFor(role, 1);
      renderFrameAt(ctx, role, 0, 0);
      const out = resolve(OUT_DIR, `${role}.png`);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, canvas.toBuffer("image/png"));
    }
    // Spritesheet — 8 horizontal frames
    {
      const { canvas, ctx } = newCanvasFor(role, FRAMES);
      for (let f = 0; f < FRAMES; f++) renderFrameAt(ctx, role, f, FRAME_W * f);
      const out = resolve(OUT_DIR, `${role}_sheet.png`);
      writeFileSync(out, canvas.toBuffer("image/png"));
    }
    console.log(`✓ ${role}`);
  }
  console.log(`\nFrame size: ${FRAME_W}×${FRAME_H} · ${FRAMES} frames per sheet`);
}

main();
