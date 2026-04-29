/**
 * Procedural placeholder sprite generator. Produces two 8-frame
 * 48×64 sheets — `keyblader1` (masculine) and `keyblader2` (feminine).
 *
 * These are intentionally simple. The real visual layer is whatever
 * the user drops into `assets/sprites/kh/keyblader1_sheet.png` /
 * `keyblader2_sheet.png` (32-frame AI-generated sheets per
 * `.docs/sprite-prompts.md`).
 *
 * Outputs to `assets/sprites/kh-default/`:
 *   - keyblader1.png         48×64 still
 *   - keyblader1_sheet.png   384×64 sheet, 8 frames horizontal
 *   - keyblader2.png         48×64 still
 *   - keyblader2_sheet.png   384×64 sheet
 *
 * Plus heartless / landmarks / iso tiles, unchanged.
 *
 * Run: bun scripts/generate-pixel-sprites.ts
 */
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Procedural placeholders match the user-override format: 32 frames at
// 96×144. The same idle/attack logic gets repeated across the 8
// animation ranges so the sheet has the right dimensions, even though
// most slots are visually identical placeholders.
const CELL = 96;
const TALL = 144;
const FRAMES = 32;

// ─── primitive helpers ──────────────────────────────────────────────

function px(ctx: SKRSContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, 1, 1);
}

function fillRect(
  ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function fillEllipse(
  ctx: SKRSContext2D, cx: number, cy: number, rx: number, ry: number, color: string
) {
  ctx.fillStyle = color;
  for (let y = -ry; y <= ry; y++) {
    for (let x = -rx; x <= rx; x++) {
      const fx = x / rx, fy = y / ry;
      if (fx * fx + fy * fy <= 1) {
        ctx.fillRect((cx + x) | 0, (cy + y) | 0, 1, 1);
      }
    }
  }
}

function shadedRect(
  ctx: SKRSContext2D, x: number, y: number, w: number, h: number,
  base: string, shadow: string, highlight: string
) {
  fillRect(ctx, x, y, w, h, base);
  fillRect(ctx, x, y + h - 1, w, 1, shadow);
  fillRect(ctx, x + w - 1, y, 1, h, shadow);
  fillRect(ctx, x, y, w - 1, 1, highlight);
}

function outlineRect(
  ctx: SKRSContext2D, x: number, y: number, w: number, h: number, color: string
) {
  fillRect(ctx, x, y, w, 1, color);
  fillRect(ctx, x, y + h - 1, w, 1, color);
  fillRect(ctx, x, y, 1, h, color);
  fillRect(ctx, x + w - 1, y, 1, h, color);
}

// ─── animation timing ──────────────────────────────────────────────

function bobOffset(frame: number): number {
  if (frame < 4) return [0, -1, 0, 1][frame] ?? 0;
  return 0;
}

type SwingPose = { tilt: number; armOut: boolean; flash: boolean };
function swingPose(frame: number): SwingPose {
  switch (frame) {
    case 4: return { tilt: -2, armOut: false, flash: false };
    case 5: return { tilt: 3, armOut: true, flash: true };
    case 6: return { tilt: 1, armOut: true, flash: false };
    case 7: return { tilt: 0, armOut: false, flash: false };
  }
  return { tilt: 0, armOut: false, flash: false };
}

function drawShadow(ctx: SKRSContext2D) {
  fillEllipse(ctx, 24, 60, 9, 2, "rgba(0,0,0,0.45)");
}

function drawFace(
  ctx: SKRSContext2D, dy: number, irisColor: string
) {
  fillRect(ctx, 19, 19 + dy, 3, 3, "#ffffff");
  fillRect(ctx, 20, 19 + dy, 2, 1, irisColor);
  fillRect(ctx, 20, 20 + dy, 2, 2, "#1a1010");
  fillRect(ctx, 26, 19 + dy, 3, 3, "#ffffff");
  fillRect(ctx, 27, 19 + dy, 2, 1, irisColor);
  fillRect(ctx, 27, 20 + dy, 2, 2, "#1a1010");
  fillRect(ctx, 19, 17 + dy, 3, 1, "#3a2010");
  fillRect(ctx, 26, 17 + dy, 3, 1, "#3a2010");
  fillRect(ctx, 23, 24 + dy, 3, 1, "#5a2810");
}

// ─── keyblader1 (masculine, twilight palette) ──────────────────────

function drawKeyblader1(ctx: SKRSContext2D, frame: number) {
  const dy = bobOffset(frame);
  const sw = swingPose(frame);
  drawShadow(ctx);

  // Pants / legs (dark navy)
  shadedRect(ctx, 18, 46 + dy, 5, 12, "#1c2454", "#0a1232", "#3a4280");
  shadedRect(ctx, 25, 46 + dy, 5, 12, "#1c2454", "#0a1232", "#3a4280");
  outlineRect(ctx, 18, 46 + dy, 5, 12, "#000000");
  outlineRect(ctx, 25, 46 + dy, 5, 12, "#000000");

  // Boots (black with gold ankle band)
  shadedRect(ctx, 17, 58 + dy, 7, 4, "#2a2a2a", "#0a0a0a", "#4a4a4a");
  shadedRect(ctx, 24, 58 + dy, 7, 4, "#2a2a2a", "#0a0a0a", "#4a4a4a");
  fillRect(ctx, 17, 58 + dy, 7, 1, "#d8a830");
  fillRect(ctx, 24, 58 + dy, 7, 1, "#d8a830");

  // Long dark coat with purple inner lining
  shadedRect(ctx, 16, 24 + dy, 16, 22, "#3a2870", "#1a1040", "#5a3878");
  // Inner lining strip down center (purple)
  fillRect(ctx, 22, 24 + dy, 4, 22, "#7a6890");
  // Gold trim along edges
  fillRect(ctx, 16, 24 + dy, 1, 22, "#d8a830");
  fillRect(ctx, 31, 24 + dy, 1, 22, "#d8a830");
  outlineRect(ctx, 16, 24 + dy, 16, 22, "#0a0518");

  // Belt (charcoal)
  fillRect(ctx, 17, 42 + dy, 14, 2, "#2a2a2a");
  fillRect(ctx, 23, 42 + dy, 2, 2, "#d8a830");

  // Hands at sides
  fillRect(ctx, 14, 38 + dy, 3, 4, "#f0d0a8");
  fillRect(ctx, 31, 38 + dy, 3, 4, "#f0d0a8");
  outlineRect(ctx, 14, 38 + dy, 3, 4, "#3a1f10");
  outlineRect(ctx, 31, 38 + dy, 3, 4, "#3a1f10");

  // Head (skin)
  shadedRect(ctx, 17, 12 + dy, 14, 13, "#f0d0a8", "#c89878", "#fae0c0");
  outlineRect(ctx, 17, 12 + dy, 14, 13, "#3a1f10");
  drawFace(ctx, dy + 1, "#3a8ad8");

  // Spiky dark hair
  const hair = "#1a1430", hairDk = "#000000", hairHi = "#3a3050";
  shadedRect(ctx, 16, 6 + dy, 16, 7, hair, hairDk, hairHi);
  // Spikes
  fillRect(ctx, 19, 2 + dy, 4, 5, hair);
  fillRect(ctx, 22, 1 + dy, 3, 4, hair);
  fillRect(ctx, 25, 2 + dy, 4, 5, hair);
  fillRect(ctx, 14, 5 + dy, 3, 4, hair);
  fillRect(ctx, 31, 5 + dy, 3, 4, hair);
  outlineRect(ctx, 16, 6 + dy, 16, 7, hairDk);

  // Twilight keyblade (Noctis Rayle-flavored — purple + silver)
  if (sw.armOut) {
    // Held forward
    fillRect(ctx, 35, 26 + dy, 3, 14, "#b0b0c0");
    fillRect(ctx, 35, 26 + dy, 3, 1, "#e0e0f0");
    outlineRect(ctx, 35, 26 + dy, 3, 14, "#1a1830");
    fillEllipse(ctx, 36, 42 + dy, 3, 2, "#5a3878");
    if (sw.flash) {
      fillRect(ctx, 38, 24 + dy, 6, 1, "#7a6890");
      fillRect(ctx, 39, 25 + dy, 5, 1, "#5a3878");
    }
  } else {
    // At side (idle)
    fillRect(ctx, 12, 30 + dy, 3, 14, "#b0b0c0");
    fillRect(ctx, 12, 30 + dy, 3, 1, "#e0e0f0");
    outlineRect(ctx, 12, 30 + dy, 3, 14, "#1a1830");
    fillEllipse(ctx, 13, 46 + dy, 3, 2, "#5a3878");
  }
}

// ─── keyblader2 (feminine, dream palette) ──────────────────────────

function drawKeyblader2(ctx: SKRSContext2D, frame: number) {
  const dy = bobOffset(frame);
  const sw = swingPose(frame);
  drawShadow(ctx);

  // Sandals
  fillRect(ctx, 17, 58 + dy, 7, 3, "#b8b8c8");
  fillRect(ctx, 24, 58 + dy, 7, 3, "#b8b8c8");

  // Pale legs / wraps
  fillRect(ctx, 18, 46 + dy, 5, 12, "#f8e8d0");
  fillRect(ctx, 25, 46 + dy, 5, 12, "#f8e8d0");
  // Silver wrap stripes
  fillRect(ctx, 18, 49 + dy, 5, 1, "#b8b8c8");
  fillRect(ctx, 25, 49 + dy, 5, 1, "#b8b8c8");
  fillRect(ctx, 18, 53 + dy, 5, 1, "#b8b8c8");
  fillRect(ctx, 25, 53 + dy, 5, 1, "#b8b8c8");

  // Layered robe — outer lavender, inner cream
  shadedRect(ctx, 14, 30 + dy, 20, 16, "#c8a0d0", "#8a6890", "#e0c8e8");
  // Inner robe peeking
  fillRect(ctx, 22, 30 + dy, 4, 16, "#fafaf5");
  // Pink sash
  fillRect(ctx, 14, 38 + dy, 20, 2, "#f0c0d8");
  // Silver belt
  fillRect(ctx, 14, 40 + dy, 20, 1, "#b8b8c8");
  outlineRect(ctx, 14, 30 + dy, 20, 16, "#503870");

  // Top (white-and-lavender)
  shadedRect(ctx, 17, 23 + dy, 14, 8, "#fafaf5", "#a8a0b0", "#ffffff");
  // Lotus brooch at chest
  fillEllipse(ctx, 24, 27 + dy, 2, 2, "#a85878");
  px(ctx, 24, 27 + dy, "#fafaf5");
  outlineRect(ctx, 17, 23 + dy, 14, 8, "#503870");

  // Hands
  fillRect(ctx, 13, 35 + dy, 3, 4, "#f8d8b8");
  fillRect(ctx, 32, 35 + dy, 3, 4, "#f8d8b8");
  outlineRect(ctx, 13, 35 + dy, 3, 4, "#3a1f10");
  outlineRect(ctx, 32, 35 + dy, 3, 4, "#3a1f10");

  // Head
  shadedRect(ctx, 17, 12 + dy, 14, 13, "#f8d8b8", "#c8a088", "#ffe8d0");
  outlineRect(ctx, 17, 12 + dy, 14, 13, "#3a1f10");
  drawFace(ctx, dy + 1, "#d8a040");

  // Long pink hair past shoulders
  const hair = "#f0c0d8", hairDk = "#a85878", hairHi = "#ffd0e0";
  shadedRect(ctx, 14, 6 + dy, 20, 9, hair, hairDk, hairHi);
  // Side strands flowing past shoulders
  fillRect(ctx, 14, 14 + dy, 3, 16, hair);
  fillRect(ctx, 31, 14 + dy, 3, 16, hair);
  fillRect(ctx, 14, 28 + dy, 3, 1, hairDk);
  fillRect(ctx, 31, 28 + dy, 3, 1, hairDk);
  // Forehead bangs
  fillRect(ctx, 18, 11 + dy, 12, 2, hair);
  // Top peak with highlight
  fillRect(ctx, 21, 4 + dy, 6, 2, hair);
  fillRect(ctx, 22, 7 + dy, 4, 1, hairHi);
  outlineRect(ctx, 14, 6 + dy, 20, 9, hairDk);

  // Lunaflower keyblade — silver + pink, lotus motif
  if (sw.armOut) {
    fillRect(ctx, 35, 24 + dy, 3, 14, "#fafaf5");
    fillRect(ctx, 35, 24 + dy, 3, 1, "#ffffff");
    outlineRect(ctx, 35, 24 + dy, 3, 14, "#503870");
    fillEllipse(ctx, 36, 40 + dy, 3, 2, "#f0c0d8");
    if (sw.flash) {
      fillRect(ctx, 38, 22 + dy, 6, 1, "#f0c0d8");
      fillRect(ctx, 39, 23 + dy, 5, 1, "#c8a0d0");
    }
  } else {
    fillRect(ctx, 12, 28 + dy, 3, 14, "#fafaf5");
    fillRect(ctx, 12, 28 + dy, 3, 1, "#ffffff");
    outlineRect(ctx, 12, 28 + dy, 3, 14, "#503870");
    fillEllipse(ctx, 13, 44 + dy, 3, 2, "#f0c0d8");
  }
}

// ─── output ────────────────────────────────────────────────────────

function makeSheet(role: "keyblader1" | "keyblader2") {
  const drawer = role === "keyblader1" ? drawKeyblader1 : drawKeyblader2;
  const sheetW = CELL * FRAMES;
  const canvas = createCanvas(sheetW, TALL);
  const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;
  ctx.imageSmoothingEnabled = false;
  for (let i = 0; i < FRAMES; i++) {
    ctx.save();
    ctx.translate(i * CELL, 0);
    drawer(ctx, i);
    ctx.restore();
  }
  const sheetPath = resolve("assets/sprites/kh-default", `${role}_sheet.png`);
  mkdirSync(dirname(sheetPath), { recursive: true });
  writeFileSync(sheetPath, canvas.toBuffer("image/png"));

  const still = createCanvas(CELL, TALL);
  const sctx = still.getContext("2d") as unknown as SKRSContext2D;
  sctx.imageSmoothingEnabled = false;
  drawer(sctx, 0);
  writeFileSync(
    resolve("assets/sprites/kh-default", `${role}.png`),
    still.toBuffer("image/png")
  );
  // eslint-disable-next-line no-console
  console.log(`✓ ${role} → ${sheetPath}`);
}

// ─── heartless (kept at 32×32) ─────────────────────────────────────

const H_CELL = 32;
const H_SHEET_W = H_CELL * FRAMES;

function drawShadowHeartless(ctx: SKRSContext2D, frame: number) {
  const dy = [0, -1, 0, 1][frame % 4] ?? 0;
  fillEllipse(ctx, 16, 18 + dy, 8, 6, "#05050a");
  fillEllipse(ctx, 16, 14 + dy, 6, 3, "#0a0518");
  px(ctx, 12, 12 + dy, "#05050a"); px(ctx, 11, 11 + dy, "#05050a");
  px(ctx, 12, 10 + dy, "#05050a"); px(ctx, 13, 9 + dy, "#05050a");
  px(ctx, 20, 12 + dy, "#05050a"); px(ctx, 21, 11 + dy, "#05050a");
  px(ctx, 20, 10 + dy, "#05050a"); px(ctx, 19, 9 + dy, "#05050a");
  px(ctx, 13, 16 + dy, "#ffd86b"); px(ctx, 14, 16 + dy, "#ffd86b");
  px(ctx, 18, 16 + dy, "#ffd86b"); px(ctx, 19, 16 + dy, "#ffd86b");
  px(ctx, 8, 22 + dy, "#05050a"); px(ctx, 24, 22 + dy, "#05050a");
  fillEllipse(ctx, 16, 26, 7, 1, "rgba(0,0,0,0.5)");
}

function drawSoldierHeartless(ctx: SKRSContext2D, frame: number) {
  const dy = [0, -1, 0, 1][frame % 4] ?? 0;
  fillRect(ctx, 11, 5 + dy, 10, 6, "#3a3850");
  fillRect(ctx, 13, 4 + dy, 6, 1, "#5a5870");
  fillRect(ctx, 13, 8 + dy, 6, 1, "#ffd86b");
  fillRect(ctx, 12, 12 + dy, 8, 8, "#1a1a30");
  fillRect(ctx, 12, 18 + dy, 8, 1, "#5a5870");
  fillRect(ctx, 15, 14 + dy, 2, 2, "#ff5a3c");
  fillRect(ctx, 12, 21 + dy, 3, 4, "#1a1a30");
  fillRect(ctx, 17, 21 + dy, 3, 4, "#1a1a30");
  fillRect(ctx, 12, 24 + dy, 3, 1, "#5a5870");
  fillRect(ctx, 17, 24 + dy, 3, 1, "#5a5870");
  fillEllipse(ctx, 16, 28, 7, 1, "rgba(0,0,0,0.5)");
}

function drawLargeBodyHeartless(ctx: SKRSContext2D, frame: number) {
  const dy = [0, -1, 0, 1][frame % 4] ?? 0;
  fillEllipse(ctx, 16, 18 + dy, 11, 8, "#3a1f5a");
  fillEllipse(ctx, 16, 18 + dy, 9, 6, "#5a2f7a");
  fillRect(ctx, 11, 18 + dy, 10, 2, "#ff5a3c");
  fillEllipse(ctx, 16, 9 + dy, 4, 4, "#3a1f5a");
  px(ctx, 14, 9 + dy, "#ffd86b"); px(ctx, 18, 9 + dy, "#ffd86b");
  fillRect(ctx, 12, 24 + dy, 3, 2, "#3a1f5a");
  fillRect(ctx, 17, 24 + dy, 3, 2, "#3a1f5a");
  fillRect(ctx, 15, 16 + dy, 2, 2, "#ff5a3c");
  fillEllipse(ctx, 16, 28, 8, 1, "rgba(0,0,0,0.55)");
}

function makeHeartlessSheets() {
  const types: [string, (ctx: SKRSContext2D, f: number) => void][] = [
    ["heartless-shadow", drawShadowHeartless],
    ["heartless-soldier", drawSoldierHeartless],
    ["heartless-largebody", drawLargeBodyHeartless],
  ];
  for (const [name, drawFn] of types) {
    const canvas = createCanvas(H_SHEET_W, H_CELL);
    const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < FRAMES; i++) {
      ctx.save();
      ctx.translate(i * H_CELL, 0);
      drawFn(ctx, i);
      ctx.restore();
    }
    writeFileSync(
      resolve("assets/sprites/kh-default", `${name}_sheet.png`),
      canvas.toBuffer("image/png")
    );
    const still = createCanvas(H_CELL, H_CELL);
    const sctx = still.getContext("2d") as unknown as SKRSContext2D;
    sctx.imageSmoothingEnabled = false;
    drawFn(sctx, 0);
    writeFileSync(
      resolve("assets/sprites/kh-default", `${name}.png`),
      still.toBuffer("image/png")
    );
    // eslint-disable-next-line no-console
    console.log(`✓ ${name}`);
  }
}

// ─── landmarks (unchanged from prior version, kept as 64×64) ────────

const LM_SIZE = 64;

function drawDisneyCastle(ctx: SKRSContext2D) {
  fillRect(ctx, 18, 38, 28, 22, "#eef7ff");
  fillRect(ctx, 18, 38, 28, 1, "#1a0f08");
  fillRect(ctx, 30, 46, 4, 14, "#4d7eff");
  fillRect(ctx, 12, 26, 6, 32, "#9dc8ff");
  fillRect(ctx, 46, 26, 6, 32, "#9dc8ff");
  fillRect(ctx, 13, 22, 4, 4, "#ffd86b");
  fillRect(ctx, 14, 19, 2, 3, "#ffd86b");
  fillRect(ctx, 47, 22, 4, 4, "#ffd86b");
  fillRect(ctx, 48, 19, 2, 3, "#ffd86b");
  fillRect(ctx, 28, 14, 8, 28, "#9dc8ff");
  fillRect(ctx, 29, 10, 6, 4, "#ffd86b");
  fillRect(ctx, 30, 6, 4, 4, "#ffd86b");
  fillRect(ctx, 31, 4, 2, 2, "#ffd86b");
  fillEllipse(ctx, 28, 2, 2, 2, "#000000");
  fillEllipse(ctx, 32, 0, 2, 2, "#000000");
  fillEllipse(ctx, 36, 2, 2, 2, "#000000");
  fillEllipse(ctx, 32, 60, 22, 2, "rgba(0,0,0,0.45)");
}

function drawHollowBastion(ctx: SKRSContext2D) {
  fillRect(ctx, 16, 34, 32, 26, "#1a1426");
  fillRect(ctx, 14, 22, 6, 18, "#2a1f3a");
  fillRect(ctx, 15, 18, 4, 4, "#9d6bff");
  fillRect(ctx, 28, 8, 8, 32, "#1a1426");
  fillRect(ctx, 29, 4, 6, 4, "#9d6bff");
  fillRect(ctx, 30, 1, 4, 3, "#ffd86b");
  fillRect(ctx, 44, 26, 6, 14, "#2a1f3a");
  fillRect(ctx, 45, 22, 4, 4, "#9d6bff");
  fillEllipse(ctx, 32, 42, 3, 3, "#000000");
  fillEllipse(ctx, 32, 42, 2, 2, "#ffd86b");
  fillRect(ctx, 31, 44, 2, 6, "#ffd86b");
  fillEllipse(ctx, 32, 60, 24, 2, "rgba(0,0,0,0.55)");
}

function drawTraverseTown(ctx: SKRSContext2D) {
  fillRect(ctx, 8, 30, 22, 30, "#6b4423");
  fillRect(ctx, 8, 26, 22, 4, "#ff7a3c");
  fillRect(ctx, 11, 22, 16, 4, "#ff7a3c");
  fillRect(ctx, 14, 18, 10, 4, "#ff7a3c");
  fillRect(ctx, 12, 50, 4, 10, "#3a2010");
  fillRect(ctx, 20, 38, 4, 5, "#ffd86b");
  fillRect(ctx, 32, 36, 22, 24, "#8a5530");
  fillRect(ctx, 32, 32, 22, 4, "#ff7a3c");
  fillRect(ctx, 35, 28, 16, 4, "#ff7a3c");
  fillRect(ctx, 38, 44, 4, 5, "#ffd86b");
  fillRect(ctx, 30, 30, 1, 26, "#444444");
  fillEllipse(ctx, 30, 28, 3, 3, "#ffd86b");
  fillEllipse(ctx, 32, 60, 26, 2, "rgba(0,0,0,0.45)");
}

function drawDestinyIslands(ctx: SKRSContext2D) {
  fillEllipse(ctx, 32, 56, 26, 5, "#f6d6a8");
  fillEllipse(ctx, 32, 58, 24, 3, "#c89a64");
  fillRect(ctx, 32, 52, 3, 4, "#6b4423");
  fillRect(ctx, 31, 46, 3, 6, "#6b4423");
  fillRect(ctx, 30, 38, 3, 8, "#6b4423");
  fillRect(ctx, 29, 30, 3, 8, "#6b4423");
  fillRect(ctx, 28, 22, 3, 8, "#6b4423");
  fillEllipse(ctx, 22, 18, 6, 3, "#4caf50");
  fillEllipse(ctx, 36, 17, 6, 3, "#4caf50");
  fillEllipse(ctx, 28, 14, 4, 3, "#4caf50");
  fillEllipse(ctx, 30, 19, 2, 2, "#ffd86b");
}

function drawTwilightTown(ctx: SKRSContext2D) {
  // Sunset bloom backdrop.
  fillEllipse(ctx, 32, 16, 22, 12, "rgba(255, 137, 163, 0.35)");
  fillEllipse(ctx, 32, 18, 16, 8, "rgba(255, 184, 108, 0.30)");
  // Stone plinth at the base.
  fillRect(ctx, 18, 54, 28, 8, "#3a2820");
  fillRect(ctx, 18, 53, 28, 1, "#5a3a2c");
  // Tall clock-tower body (Big-Ben-style — narrow, tall).
  fillRect(ctx, 26, 18, 12, 36, "#a87a4a");
  fillRect(ctx, 26, 17, 12, 1, "#7a5530");      // top ledge shadow
  fillRect(ctx, 25, 18, 1, 36, "#7a5530");      // left depth
  fillRect(ctx, 38, 18, 1, 36, "#5a3a20");      // right depth
  // Decorative brick rows.
  fillRect(ctx, 26, 26, 12, 1, "#7a5530");
  fillRect(ctx, 26, 38, 12, 1, "#7a5530");
  fillRect(ctx, 26, 50, 12, 1, "#7a5530");
  // Big clock face (8x8 circle near the top).
  fillEllipse(ctx, 32, 24, 5, 5, "#0a0a14");
  fillEllipse(ctx, 32, 24, 4, 4, "#f7e8c8");
  fillRect(ctx, 32, 22, 1, 3, "#1a1426");       // minute hand (up)
  fillRect(ctx, 32, 24, 3, 1, "#1a1426");       // hour hand (right)
  fillRect(ctx, 31, 23, 1, 1, "#ff5a3c");       // pin
  // Belfry crown — narrow tier above the clock.
  fillRect(ctx, 28, 13, 8, 4, "#8a5530");
  fillRect(ctx, 28, 12, 8, 1, "#5a3a20");
  fillRect(ctx, 30, 14, 1, 2, "#ffd86b");       // belfry windows (lit)
  fillRect(ctx, 33, 14, 1, 2, "#ffd86b");
  // Spire + cross.
  fillRect(ctx, 30, 6, 4, 7, "#5a3a20");
  fillRect(ctx, 31, 3, 2, 3, "#7a5530");
  fillRect(ctx, 31, 1, 2, 2, "#ffd86b");        // gilded peak
  fillRect(ctx, 30, 2, 4, 1, "#ffd86b");        // crossbar
  // Stained glass on the body — small.
  fillRect(ctx, 30, 32, 4, 4, "#6cc6ff");
  fillRect(ctx, 31, 33, 2, 2, "#a4d8ff");
  fillRect(ctx, 30, 44, 4, 4, "#6cc6ff");
  fillRect(ctx, 31, 45, 2, 2, "#a4d8ff");
  // Ground shadow.
  fillEllipse(ctx, 32, 62, 24, 2, "rgba(0,0,0,0.45)");
}

function drawHalloweenTown(ctx: SKRSContext2D) {
  // Crescent moon in the sky.
  fillEllipse(ctx, 12, 10, 5, 5, "#ffd86b");
  fillEllipse(ctx, 14, 9, 4, 4, "#1a0f24");      // crescent bite
  // Curly Hill — the iconic spiral silhouette. Hand-drawn pixel curl.
  fillRect(ctx, 12, 50, 40, 12, "#1a0f24");      // base mound
  fillRect(ctx, 14, 48, 36, 2, "#1a0f24");
  fillRect(ctx, 18, 44, 28, 4, "#1a0f24");
  fillRect(ctx, 22, 40, 18, 4, "#1a0f24");
  fillRect(ctx, 26, 36, 12, 4, "#1a0f24");
  fillRect(ctx, 30, 32, 8, 4, "#1a0f24");
  fillRect(ctx, 34, 28, 6, 4, "#1a0f24");
  fillRect(ctx, 36, 24, 5, 4, "#1a0f24");
  // The curl — hook to the right at the top of the hill.
  fillRect(ctx, 38, 20, 4, 4, "#1a0f24");
  fillRect(ctx, 40, 18, 4, 2, "#1a0f24");
  fillRect(ctx, 42, 16, 3, 2, "#1a0f24");
  fillRect(ctx, 43, 18, 2, 2, "#1a0f24");
  fillRect(ctx, 41, 20, 2, 2, "#1a0f24");        // inner curl shadow
  // Bare twisted tree on the left foreground.
  fillRect(ctx, 8, 36, 2, 22, "#0a0510");        // trunk
  fillRect(ctx, 6, 32, 2, 6, "#0a0510");         // branch left-up
  fillRect(ctx, 4, 30, 2, 2, "#0a0510");
  fillRect(ctx, 10, 28, 2, 8, "#0a0510");        // branch up
  fillRect(ctx, 12, 30, 2, 4, "#0a0510");        // branch right
  fillRect(ctx, 14, 32, 2, 2, "#0a0510");
  // Pumpkins at the foot — two of them, one bigger.
  fillEllipse(ctx, 18, 56, 4, 3, "#ff7a3c");
  fillRect(ctx, 17, 54, 2, 1, "#3d2010");        // stem
  fillEllipse(ctx, 50, 56, 5, 4, "#ff7a3c");
  fillEllipse(ctx, 50, 56, 4, 3, "#ff9a4c");     // highlight
  fillRect(ctx, 49, 53, 2, 1, "#3d2010");        // stem
  fillRect(ctx, 47, 55, 1, 1, "#ffd86b");        // jack-o-lantern eye
  fillRect(ctx, 51, 55, 1, 1, "#ffd86b");        // jack-o-lantern eye
  fillRect(ctx, 49, 57, 3, 1, "#1a0f24");        // grin
  // Distant gravestones — silhouette dots at the right of the hill.
  fillRect(ctx, 54, 52, 3, 6, "#3a2840");
  fillRect(ctx, 53, 53, 1, 1, "#3a2840");
  fillRect(ctx, 57, 53, 1, 1, "#3a2840");
  // Ground shadow.
  fillEllipse(ctx, 32, 62, 28, 2, "rgba(0,0,0,0.55)");
}

function makeLandmarks() {
  const drawers: [string, (c: SKRSContext2D) => void][] = [
    ["landmark-disney", drawDisneyCastle],
    ["landmark-hollow", drawHollowBastion],
    ["landmark-traverse", drawTraverseTown],
    ["landmark-destiny", drawDestinyIslands],
    ["landmark-twilight", drawTwilightTown],
    ["landmark-halloween", drawHalloweenTown],
  ];
  for (const [name, fn] of drawers) {
    const canvas = createCanvas(LM_SIZE, LM_SIZE);
    const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;
    ctx.imageSmoothingEnabled = false;
    fn(ctx);
    writeFileSync(
      resolve("assets/sprites/kh-default", `${name}.png`),
      canvas.toBuffer("image/png")
    );
    // eslint-disable-next-line no-console
    console.log(`✓ ${name}`);
  }
}

// ─── iso ground tiles (96×48) ──────────────────────────────────────

const TILE_W = 96;
const TILE_H = 48;

function drawIsoTile(ctx: SKRSContext2D, base: string, edge: string, hi: string) {
  for (let y = 0; y < TILE_H; y++) {
    const halfFromMid = Math.abs(y - (TILE_H / 2 - 0.5)) * (TILE_W / TILE_H);
    const halfWidth = (TILE_W / 2) - halfFromMid;
    if (halfWidth < 1) continue;
    fillRect(ctx, Math.round(TILE_W / 2 - halfWidth), y,
      Math.round(halfWidth * 2), 1, base);
  }
  for (let y = 0; y < TILE_H / 2; y++) {
    const halfFromMid = ((TILE_H / 2 - 0.5) - y) * (TILE_W / TILE_H);
    const x = Math.round(TILE_W / 2 - halfFromMid);
    px(ctx, x, y, hi); px(ctx, TILE_W - x - 1, y, hi);
  }
  for (let y = TILE_H / 2; y < TILE_H; y++) {
    const halfFromMid = (y - (TILE_H / 2 - 0.5)) * (TILE_W / TILE_H);
    const x = Math.round(TILE_W / 2 - halfFromMid);
    px(ctx, x, y, edge); px(ctx, TILE_W - x - 1, y, edge);
  }
}

function makeGroundTiles() {
  const variants: [string, string, string, string][] = [
    ["tile-iso-a", "#1a2854", "#08102a", "#3a4880"],
    ["tile-iso-b", "#15224a", "#040820", "#2c3868"],
  ];
  for (const [name, base, edge, hi] of variants) {
    const canvas = createCanvas(TILE_W, TILE_H);
    const ctx = canvas.getContext("2d") as unknown as SKRSContext2D;
    ctx.imageSmoothingEnabled = false;
    drawIsoTile(ctx, base, edge, hi);
    writeFileSync(
      resolve("assets/sprites/kh-default", `${name}.png`),
      canvas.toBuffer("image/png")
    );
    // eslint-disable-next-line no-console
    console.log(`✓ ${name}`);
  }
}

// ─── run ───────────────────────────────────────────────────────────
//
// Pass group names to limit output. Useful since the keyblader stills +
// sheets in this script are placeholder programmatic art that has been
// superseded by hand-authored / AI-generated keybladers shipped in
// kh-default/. Running the script with no args overwrites them too —
// always pass a filter unless you really want the procedural ones.
//
// Examples:
//   bun scripts/generate-pixel-sprites.ts landmarks
//   bun scripts/generate-pixel-sprites.ts heartless tiles
//   bun scripts/generate-pixel-sprites.ts all          # full run
const args = process.argv.slice(2);
const groups = args.length === 0 || args.includes("all")
  ? new Set(["keybladers", "heartless", "landmarks", "tiles"])
  : new Set(args);

if (groups.has("keybladers")) {
  makeSheet("keyblader1");
  makeSheet("keyblader2");
}
if (groups.has("heartless")) makeHeartlessSheets();
if (groups.has("landmarks")) makeLandmarks();
if (groups.has("tiles")) makeGroundTiles();
console.log(`\nDone — groups: ${[...groups].join(", ")}.`);
