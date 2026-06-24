/**
 * Concept-sheet → game-sheet extractor.
 *
 * Source: a multi-character concept sheet (e.g. the AI-generated
 * Kingdom-style concept page with 8 cards, each containing a portrait,
 * 4 idle frames, 4 attack frames, weapon detail, and palette).
 *
 * Output: per-character `<role>_sheet.png` (8 frames horizontal) +
 * `<role>.png` (still = frame 0) in `assets/sprites/rw/`.
 *
 * Strategy: grid-detection. The script doesn't blindly slice — it auto-
 * trims each detected frame to its content bounding box, then places
 * every frame on a uniform-size canvas, bottom-anchored + centered.
 *
 * Run: bun scripts/extract-concept-sheet.ts <input.png>
 */
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Per-character extraction config. Coordinates are pixel positions in
// the source 1536×1024 concept sheet. Each entry says where the 4 idle
// frames live (y row) and where the 4 attack frames live, plus the card
// origin. Tuned visually; tweak if the source layout shifts.
type CardSpec = {
  role: string; // game slot identifier (warden1, warden2, etc.)
  display: string; // character name for logging
  // Card bounds (top-left + size)
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  // First-frame top-left in absolute coords for the IDLE row
  idleX: number;
  idleY: number;
  // Frame size and horizontal stride between frames in the IDLE row
  frameW: number;
  frameH: number;
  frameStrideX: number;
  // ATTACK row — same frame size, just different y
  attackY: number;
};

// Top row: 5 cards, ~307 px wide each. Bottom row: 3 cards, ~512 px wide.
// Within each card, IDLE row is upper-right of portrait, ATTACK below it.
// Frame size is roughly 50×100 in the source.
//
// Slot mapping per .docs/sprite-prompts.md.

const SOURCE_W = 1536;
void SOURCE_W;

// Top row tuning — 5 cards across.
const TOP_CARD_W = 295;
const TOP_CARD_H = 500;
const TOP_CARD_Y = 18;
const TOP_GAP = 12;
const TOP_X = (i: number) => 16 + i * (TOP_CARD_W + TOP_GAP);

// Within a top card:
const TOP_IDLE_X_REL = 95; // x offset of frame 0 from card left
const TOP_IDLE_Y_REL = 70; // y offset
const TOP_ATTACK_Y_REL = 198; // y offset of attack row
const TOP_FRAME_W = 50;
const TOP_FRAME_H = 100;
const TOP_FRAME_STRIDE = 50;

// Bottom row tuning — 3 cards across, larger.
const BOT_CARD_W = 500;
const BOT_CARD_H = 500;
const BOT_CARD_Y = 530;
const BOT_GAP = 10;
const BOT_X = (i: number) => 14 + i * (BOT_CARD_W + BOT_GAP);

const BOT_IDLE_X_REL = 156;
const BOT_IDLE_Y_REL = 70;
const BOT_ATTACK_Y_REL = 200;
const BOT_FRAME_W = 80;
const BOT_FRAME_H = 110;
const BOT_FRAME_STRIDE = 80;

const CARDS: CardSpec[] = [
  // Top row
  topCard(0, "warden1", "Vaelen"),
  topCard(1, "warden4", "Lyris"),
  topCard(2, "warden3", "Ryder"),
  topCard(3, "warden2", "Selene"),
  topCard(4, "warden5", "Orion"),
  // Bottom row
  botCard(0, "warden6", "Kaeda"),
  botCard(1, "warden7", "Niva"),
  botCard(2, "warden8", "Tarro"),
];

function topCard(col: number, role: string, display: string): CardSpec {
  const cardX = TOP_X(col);
  return {
    role,
    display,
    cardX,
    cardY: TOP_CARD_Y,
    cardW: TOP_CARD_W,
    cardH: TOP_CARD_H,
    idleX: cardX + TOP_IDLE_X_REL,
    idleY: TOP_CARD_Y + TOP_IDLE_Y_REL,
    frameW: TOP_FRAME_W,
    frameH: TOP_FRAME_H,
    frameStrideX: TOP_FRAME_STRIDE,
    attackY: TOP_CARD_Y + TOP_ATTACK_Y_REL,
  };
}

function botCard(col: number, role: string, display: string): CardSpec {
  const cardX = BOT_X(col);
  return {
    role,
    display,
    cardX,
    cardY: BOT_CARD_Y,
    cardW: BOT_CARD_W,
    cardH: BOT_CARD_H,
    idleX: cardX + BOT_IDLE_X_REL,
    idleY: BOT_CARD_Y + BOT_IDLE_Y_REL,
    frameW: BOT_FRAME_W,
    frameH: BOT_FRAME_H,
    frameStrideX: BOT_FRAME_STRIDE,
    attackY: BOT_CARD_Y + BOT_ATTACK_Y_REL,
  };
}

// Find the bounding box of "content" inside a region — anything not
// matching the dark navy backdrop. Backdrop is roughly RGB <30,40,60>;
// any pixel meaningfully brighter is treated as content.
function findContentBox(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } | null {
  const img = ctx.getImageData(x, y, w, h);
  const data = img.data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      // Backdrop is dark navy; content is anything notably brighter.
      const brightness = r + g + b;
      const isBg = brightness < 130 && r < 50 && g < 60 && b < 90;
      if (!isBg) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (maxX < 0) return null;
  return {
    x: x + minX,
    y: y + minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1,
  };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error("usage: bun scripts/extract-concept-sheet.ts <input.png>");
    process.exit(1);
  }
  const targetW = Number(process.env.TARGET_W ?? 64);
  const targetH = Number(process.env.TARGET_H ?? 96);
  const outDir = process.env.OUT_DIR ?? "assets/sprites/rw";

  const img = await loadImage(input);
  const W = img.width;
  const H = img.height;
  const src = createCanvas(W, H);
  const sctx = src.getContext("2d") as unknown as SKRSContext2D;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(
    img as unknown as Parameters<SKRSContext2D["drawImage"]>[0],
    0,
    0
  );

  for (const card of CARDS) {
    // Slice the 8 frames out of this card. 4 idle (y=idleY), then 4
    // attack (y=attackY). Each frame is frameW × frameH at strides of
    // frameStrideX horizontally.
    const rawFrames: { x: number; y: number; w: number; h: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const fx = card.idleX + i * card.frameStrideX;
      const trim = findContentBox(
        sctx,
        fx,
        card.idleY,
        card.frameW,
        card.frameH
      );
      if (trim) rawFrames.push(trim);
      else
        rawFrames.push({
          x: fx,
          y: card.idleY,
          w: card.frameW,
          h: card.frameH,
        });
    }
    for (let i = 0; i < 4; i++) {
      const fx = card.idleX + i * card.frameStrideX;
      const trim = findContentBox(
        sctx,
        fx,
        card.attackY,
        card.frameW,
        card.frameH
      );
      if (trim) rawFrames.push(trim);
      else
        rawFrames.push({
          x: fx,
          y: card.attackY,
          w: card.frameW,
          h: card.frameH,
        });
    }

    // Compute uniform frame size — biggest content box across all 8
    // frames. Then scale each into target size, preserving aspect.
    const maxW = rawFrames.reduce((m, f) => Math.max(m, f.w), 0);
    const maxH = rawFrames.reduce((m, f) => Math.max(m, f.h), 0);
    const scale = Math.min(targetW / maxW, targetH / maxH);

    const sheetW = targetW * 8;
    const out = createCanvas(sheetW, targetH);
    const octx = out.getContext("2d") as unknown as SKRSContext2D;
    octx.imageSmoothingEnabled = false;

    for (let i = 0; i < 8; i++) {
      const f = rawFrames[i];
      const drawW = Math.round(f.w * scale);
      const drawH = Math.round(f.h * scale);
      // Center horizontally + bottom-anchor vertically so feet line up.
      const dx = i * targetW + Math.floor((targetW - drawW) / 2);
      const dy = targetH - drawH;
      octx.drawImage(
        img as unknown as Parameters<SKRSContext2D["drawImage"]>[0],
        f.x,
        f.y,
        f.w,
        f.h,
        dx,
        dy,
        drawW,
        drawH
      );
    }

    // Replace residual dark-navy background pixels with full
    // transparency so the sprites read on any in-game background.
    const finalImg = octx.getImageData(0, 0, sheetW, targetH);
    const fd = finalImg.data;
    for (let p = 0; p < fd.length; p += 4) {
      const r = fd[p],
        g = fd[p + 1],
        b = fd[p + 2];
      if (r + g + b < 130 && r < 50 && g < 60 && b < 90) {
        fd[p + 3] = 0;
      }
    }
    octx.putImageData(finalImg, 0, 0);

    const sheetPath = resolve(outDir, `${card.role}_sheet.png`);
    mkdirSync(dirname(sheetPath), { recursive: true });
    writeFileSync(sheetPath, out.toBuffer("image/png"));

    // Still = frame 0 of the sheet.
    const still = createCanvas(targetW, targetH);
    const stCtx = still.getContext("2d") as unknown as SKRSContext2D;
    stCtx.imageSmoothingEnabled = false;
    stCtx.drawImage(
      out as unknown as Parameters<SKRSContext2D["drawImage"]>[0],
      0,
      0,
      targetW,
      targetH,
      0,
      0,
      targetW,
      targetH
    );
    const stillPath = resolve(outDir, `${card.role}.png`);
    writeFileSync(stillPath, still.toBuffer("image/png"));

    console.log(
      `✓ ${card.display.padEnd(8)} → ${card.role.padEnd(13)} (${sheetW}×${targetH})`
    );
  }
}

void main();
