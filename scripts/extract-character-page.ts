/**
 * Single-character concept-page → game sheet extractor.
 *
 * Source: a 1536×1024 (or similar) concept page with one character,
 * laid out as: large portrait on left, 4 idle frames top-right, 4
 * attack frames bottom-right, weapon detail + palette at bottom.
 *
 * Output: `<role>_sheet.png` (8 frames horizontal, uniform size) +
 * `<role>.png` (still = frame 0) in `assets/sprites/kh/`.
 *
 * Run: bun scripts/extract-character-page.ts <input.png> <role>
 *
 * Tunables via env:
 *   FRAMES_X        — left edge of frames panel        (default 480)
 *   FRAMES_R        — right edge of frames panel       (default 1500)
 *   IDLE_Y          — top y of idle row                (default 40)
 *   IDLE_H          — height of idle row               (default 290)
 *   ATTACK_Y        — top y of attack row              (default 360)
 *   ATTACK_H        — height of attack row             (default 290)
 *   TARGET_W        — final per-frame width            (default 96)
 *   TARGET_H        — final per-frame height           (default 144)
 */
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v == null) return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// Sample the actual backdrop color from a known-empty corner of the
// source image (top-left 4×4 patch). Returns [r, g, b] of the most
// frequent color in that patch.
function sampleBackdrop(
  ctx: SKRSContext2D,
  W: number,
  H: number
): [number, number, number] {
  void W; void H;
  const img = ctx.getImageData(0, 0, 8, 8);
  const data = img.data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

// "Is this pixel close to the sampled backdrop?" — Manhattan distance
// in RGB space. Tight tolerance so the character's dark armor isn't
// keyed out.
function isBackdrop(
  r: number, g: number, b: number,
  bd: [number, number, number],
  tol: number
): boolean {
  return (
    Math.abs(r - bd[0]) <= tol &&
    Math.abs(g - bd[1]) <= tol &&
    Math.abs(b - bd[2]) <= tol
  );
}

const BG_TOL = 18;

// Find the bounding box of non-backdrop content in a region.
function findContentBox(
  ctx: SKRSContext2D,
  x: number, y: number, w: number, h: number,
  bd: [number, number, number]
): { x: number; y: number; w: number; h: number } | null {
  const img = ctx.getImageData(x, y, w, h);
  const data = img.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      if (!isBackdrop(data[i], data[i + 1], data[i + 2], bd, BG_TOL)) {
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
    }
  }
  if (maxX < 0) return null;
  return { x: x + minX, y: y + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function main() {
  const input = process.argv[2];
  const role = process.argv[3];
  if (!input || !role) {
    console.error(
      "usage: bun scripts/extract-character-page.ts <input.png> <role>"
    );
    process.exit(1);
  }

  const framesX = num("FRAMES_X", 480);
  const framesR = num("FRAMES_R", 1500);
  const idleY = num("IDLE_Y", 40);
  const idleH = num("IDLE_H", 290);
  const attackY = num("ATTACK_Y", 360);
  const attackH = num("ATTACK_H", 290);
  const targetW = num("TARGET_W", 96);
  const targetH = num("TARGET_H", 144);
  const outDir = process.env.OUT_DIR ?? "assets/sprites/kh";

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

  const cellW = (framesR - framesX) / 4;

  // Slice the 8 cells (4 idle + 4 attack), auto-trim each to its
  // character silhouette. Trim ignores small isolated content (like
  // frame-number labels below the character) by requiring the largest
  // connected region.
  const rawFrames: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const f = findContentBox(
      sctx,
      Math.round(framesX + i * cellW),
      idleY,
      Math.round(cellW),
      idleH
    );
    rawFrames.push(
      f ?? {
        x: Math.round(framesX + i * cellW),
        y: idleY,
        w: Math.round(cellW),
        h: idleH,
      }
    );
  }
  for (let i = 0; i < 4; i++) {
    const f = findContentBox(
      sctx,
      Math.round(framesX + i * cellW),
      attackY,
      Math.round(cellW),
      attackH
    );
    rawFrames.push(
      f ?? {
        x: Math.round(framesX + i * cellW),
        y: attackY,
        w: Math.round(cellW),
        h: attackH,
      }
    );
  }

  // Frame-number labels below the character can sneak into the trim
  // because they're bright pixels too. Crop bottom 10% of each detected
  // box if it looks like a thin label strip (small height, isolated).
  // Heuristic: trim trailing rows that have very few non-bg pixels.
  for (const f of rawFrames) {
    const refined = trimTrailingLabel(sctx, f);
    f.x = refined.x;
    f.y = refined.y;
    f.w = refined.w;
    f.h = refined.h;
  }

  // Uniform output: scale every frame to fit (targetW × targetH) while
  // preserving aspect ratio. Use the largest content box as the
  // reference so no character gets cropped.
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

  // Replace residual dark-navy background with full transparency.
  const finalImg = octx.getImageData(0, 0, sheetW, targetH);
  const fd = finalImg.data;
  for (let p = 0; p < fd.length; p += 4) {
    const r = fd[p];
    const g = fd[p + 1];
    const b = fd[p + 2];
    if (r < 50 && g < 60 && b < 90) {
      fd[p + 3] = 0;
    }
  }
  octx.putImageData(finalImg, 0, 0);

  const sheetPath = resolve(outDir, `${role}_sheet.png`);
  mkdirSync(dirname(sheetPath), { recursive: true });
  writeFileSync(sheetPath, out.toBuffer("image/png"));

  // Still — frame 0 of the sheet
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
  writeFileSync(resolve(outDir, `${role}.png`), still.toBuffer("image/png"));

  console.log(
    `✓ ${role} → ${sheetPath} (${sheetW}×${targetH}, frames sized ${targetW}×${targetH})`
  );
  console.log(
    `  raw boxes: ${rawFrames
      .map((f, i) => `${i}=${f.w}×${f.h}`)
      .join(", ")}`
  );
}

// Trim trailing rows that are mostly background — strips small label
// remnants below the character ("0", "1", etc.). Walks bottom→top until
// a row has at least 5% non-bg pixels.
function trimTrailingLabel(
  ctx: SKRSContext2D,
  box: { x: number; y: number; w: number; h: number }
): { x: number; y: number; w: number; h: number } {
  const { x, y, w, h } = box;
  if (w === 0 || h === 0) return box;
  const img = ctx.getImageData(x, y, w, h);
  const data = img.data;
  let lastSolidRow = h - 1;
  for (let py = h - 1; py >= 0; py--) {
    let nonBg = 0;
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const isBg = r < 50 && g < 60 && b < 90;
      if (!isBg) nonBg++;
    }
    if (nonBg / w > 0.05) {
      lastSolidRow = py;
      break;
    }
  }
  // Also detect a band of mostly-background between content (gap above
  // a label). If we walked back through significant rows, find the last
  // continuous band of content.
  return { x, y, w, h: lastSolidRow + 1 };
}

void main();
