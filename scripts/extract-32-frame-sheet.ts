/**
 * 32-frame multi-row sheet extractor.
 *
 * Source: a sheet with up to 32 character poses arranged in irregular
 * rows (e.g. 12 + 12 + 8). Each pose has a frame number label below it.
 * The AI gen sometimes drops a frame per row (resulting in 11+11+8 =
 * 30 etc.), so we don't trust any fixed stride.
 *
 * Output: a single horizontal frame strip at uniform dimensions, ready
 * for Phaser's spritesheet loader. Drops to
 * `assets/sprites/kh/<role>_sheet.png` plus a still for frame 0.
 *
 * Strategy:
 *   1. Auto-detect content rows by scanning rows of non-background
 *      pixels separated by mostly-empty bands.
 *   2. Within each row, find actual frame boundaries by column-gap
 *      detection — every contiguous run of non-bg columns is one
 *      frame. No fixed stride; an 11-frame row stays 11 frames.
 *   3. Per-frame trim drops the small frame-number label below the
 *      character via vertical gap detection.
 *   4. Body-axis anchor (column-fill-weighted COM over upper 50% of
 *      bbox) keeps the head/torso centered across all poses.
 *   5. Place every frame onto a uniform-size canvas, bottom-anchored
 *      and symmetrically padded around the body axis.
 *
 * Run:
 *   bun scripts/extract-32-frame-sheet.ts <input.png> <role>
 *     [--bg-tol=24] [--out=assets/sprites/kh]
 */
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function parseArgs() {
  const argv = process.argv.slice(2);
  const positional = argv.filter((a) => !a.startsWith("--"));
  const flags = new Map<string, string>();
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      flags.set(k, v ?? "true");
    }
  }
  const [input, role] = positional;
  if (!input || !role) {
    console.error(
      "usage: bun scripts/extract-32-frame-sheet.ts <input.png> <role> " +
        "[--rows=12,12,8] [--bg-tol=24] [--out=assets/sprites/kh]"
    );
    process.exit(1);
  }
  return {
    input,
    role,
    rows: (flags.get("rows") ?? "12,12,8").split(",").map(Number),
    frameW: 0,
    frameH: 0,
    bgTol: Number(flags.get("bg-tol") ?? 24),
    outDir: flags.get("out") ?? "assets/sprites/kh",
  };
}

// Sample backdrop color from the top-left corner. Treat that as the
// alpha-key color.
function sampleBackdrop(ctx: SKRSContext2D): [number, number, number, number] {
  const img = ctx.getImageData(0, 0, 8, 8);
  const d = img.data;
  let r = 0,
    g = 0,
    b = 0,
    a = 0,
    n = 0;
  for (let i = 0; i < d.length; i += 4) {
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
    a += d[i + 3];
    n++;
  }
  return [
    Math.round(r / n),
    Math.round(g / n),
    Math.round(b / n),
    Math.round(a / n),
  ];
}

function isBackdrop(
  r: number,
  g: number,
  b: number,
  a: number,
  bd: [number, number, number, number],
  tol: number
): boolean {
  // Fully transparent pixels are always background.
  if (a < 16) return true;
  // Otherwise, RGB-distance check against the sampled backdrop.
  return (
    Math.abs(r - bd[0]) <= tol &&
    Math.abs(g - bd[1]) <= tol &&
    Math.abs(b - bd[2]) <= tol
  );
}

// Detect rows of content. Scan vertically, count non-bg pixels per row.
// Group consecutive rows with content > threshold into bands.
function detectContentRows(
  ctx: SKRSContext2D,
  W: number,
  H: number,
  bd: [number, number, number, number],
  tol: number
): { y: number; h: number }[] {
  const rowFill = new Float32Array(H);
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let y = 0; y < H; y++) {
    let count = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!isBackdrop(d[i], d[i + 1], d[i + 2], d[i + 3], bd, tol)) count++;
    }
    rowFill[y] = count / W;
  }
  // A "content row" has > 1% non-bg pixels.
  const bands: { y: number; h: number }[] = [];
  let inBand = false;
  let bandStart = 0;
  for (let y = 0; y < H; y++) {
    if (rowFill[y] > 0.01) {
      if (!inBand) {
        inBand = true;
        bandStart = y;
      }
    } else {
      if (inBand) {
        inBand = false;
        const h = y - bandStart;
        // Only keep substantial bands — skip thin label strips.
        if (h > 30) bands.push({ y: bandStart, h });
      }
    }
  }
  if (inBand) bands.push({ y: bandStart, h: H - bandStart });
  return bands;
}

// Within a horizontal slab, slice into N evenly-spaced columns and
// trim each to its content bounding box.
function trimBox(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  bd: [number, number, number, number],
  tol: number
): { x: number; y: number; w: number; h: number } | null {
  const img = ctx.getImageData(x, y, w, h);
  const d = img.data;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const i = (py * w + px) * 4;
      if (!isBackdrop(d[i], d[i + 1], d[i + 2], d[i + 3], bd, tol)) {
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

// Trim a slice to the character only. The source band typically includes a
// small frame-number label below the character ("0", "1", ...). Find the
// first vertical gap (>= GAP rows of empty pixels) inside the bbox; if more
// content appears below that gap, cut there to drop the label.
//
// Returns the character bbox PLUS a body-axis anchor X (relative to bbox
// left). Anchor = column-fill-weighted center of mass of the upper half
// of the bbox — that captures the head/torso central axis, which is more
// reliable than feet detection (a hanging keyblade or chain dips below
// feet level and skews a feet-only center).
type CharFrame = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  ax: number;
};
const LABEL_GAP_ROWS = 4;
const BODY_TOP_PCT = 0.5;
function trimToCharacter(
  ctx: SKRSContext2D,
  cellX: number,
  cellY: number,
  cellW: number,
  cellH: number,
  bd: [number, number, number, number],
  tol: number
): CharFrame | null {
  const full = trimBox(ctx, cellX, cellY, cellW, cellH, bd, tol);
  if (!full) return null;
  // Compute per-row fill across the bbox to spot the label gap.
  const img = ctx.getImageData(full.x, full.y, full.w, full.h);
  const d = img.data;
  const rowFill = new Uint16Array(full.h);
  for (let py = 0; py < full.h; py++) {
    let count = 0;
    for (let px = 0; px < full.w; px++) {
      const i = (py * full.w + px) * 4;
      if (!isBackdrop(d[i], d[i + 1], d[i + 2], d[i + 3], bd, tol)) count++;
    }
    rowFill[py] = count;
  }
  // Scan top→bottom for the first empty run >= LABEL_GAP_ROWS that has
  // more content after it (= label below). Cut the bbox at the gap start.
  let cutAt = full.h;
  let runEmpty = 0;
  let runStart = -1;
  for (let py = 0; py < full.h; py++) {
    if (rowFill[py] === 0) {
      if (runStart < 0) runStart = py;
      runEmpty++;
      if (runEmpty >= LABEL_GAP_ROWS) {
        let resumes = false;
        for (let py2 = py + 1; py2 < full.h; py2++) {
          if (rowFill[py2] > 0) {
            resumes = true;
            break;
          }
        }
        if (resumes) {
          cutAt = runStart;
          break;
        }
      }
    } else {
      runEmpty = 0;
      runStart = -1;
    }
  }
  // Re-bbox with the label trimmed off.
  const reBox = trimBox(ctx, full.x, full.y, full.w, cutAt, bd, tol) ?? full;
  // Body axis: center-of-mass over the upper BODY_TOP_PCT of the bbox.
  // Excludes lower body + dangling weapon/chain that would skew a
  // bottom-centered anchor.
  const upperH = Math.max(2, Math.floor(reBox.h * BODY_TOP_PCT));
  const upperImg = ctx.getImageData(reBox.x, reBox.y, reBox.w, upperH);
  const ud = upperImg.data;
  let sumX = 0,
    count = 0;
  for (let py = 0; py < upperH; py++) {
    for (let px = 0; px < reBox.w; px++) {
      const i = (py * reBox.w + px) * 4;
      if (!isBackdrop(ud[i], ud[i + 1], ud[i + 2], ud[i + 3], bd, tol)) {
        sumX += px;
        count++;
      }
    }
  }
  const ax = count > 0 ? Math.round(sumX / count) : Math.floor(reBox.w / 2);
  return { sx: reBox.x, sy: reBox.y, sw: reBox.w, sh: reBox.h, ax };
}

// Find frame boundaries inside one row, forced to `expected` count.
//
// Stage 1: column-gap detection — every contiguous run of non-bg
//   columns separated by >= MIN_FRAME_GAP_COLS empty columns is one
//   raw frame.
// Stage 2: filter sub-MIN_FRAME_WIDTH slivers (label flecks, glow
//   bleed) into their neighbours.
// Stage 3: reconcile against expected count.
//   - If too few: split widest frame at its internal column-fill
//     minimum (handles AI-gen packing two side-profile poses with
//     zero column gap, e.g. keyblades touching).
//   - If too many: merge the pair with the narrowest gap between them
//     (handles spurious mid-frame breaks when a character has a thin
//     limb separated from the body by bg pixels).
// Repeats until the row has exactly `expected` frames.
const MIN_FRAME_GAP_COLS = 2;
const MIN_FRAME_WIDTH = 30;
function detectFrameBounds(
  ctx: SKRSContext2D,
  W: number,
  band: { y: number; h: number },
  bd: [number, number, number, number],
  tol: number,
  expected: number
): { x: number; w: number }[] {
  const img = ctx.getImageData(0, band.y, W, band.h);
  const d = img.data;
  const colFill = new Uint16Array(W);
  for (let x = 0; x < W; x++) {
    let c = 0;
    for (let y = 0; y < band.h; y++) {
      const i = (y * W + x) * 4;
      if (!isBackdrop(d[i], d[i + 1], d[i + 2], d[i + 3], bd, tol)) c++;
    }
    colFill[x] = c;
  }
  const raw: { x: number; w: number }[] = [];
  let inF = false,
    fs = 0,
    gap = 0;
  for (let x = 0; x < W; x++) {
    if (colFill[x] > 0) {
      if (!inF) {
        inF = true;
        fs = x;
      }
      gap = 0;
    } else if (inF) {
      gap++;
      if (gap >= MIN_FRAME_GAP_COLS) {
        raw.push({ x: fs, w: x - gap - fs + 1 });
        inF = false;
        gap = 0;
      }
    }
  }
  if (inF) raw.push({ x: fs, w: W - fs });
  // Merge sliver noise into neighbours.
  const merged: { x: number; w: number }[] = [];
  for (const f of raw) {
    if (f.w < MIN_FRAME_WIDTH && merged.length > 0) {
      const prev = merged[merged.length - 1];
      prev.w = f.x + f.w - prev.x;
    } else {
      merged.push({ ...f });
    }
  }
  let frames = merged.filter((f) => f.w >= MIN_FRAME_WIDTH);

  // Reconcile to expected count.
  let safety = 16;
  while (frames.length !== expected && safety-- > 0) {
    if (frames.length < expected) {
      // Split widest at its inner column-fill minimum.
      const idx = frames.reduce(
        (best, f, i) => (f.w > frames[best].w ? i : best),
        0
      );
      const f = frames[idx];
      const margin = Math.max(2, Math.floor(f.w * 0.25));
      let splitX = f.x + Math.floor(f.w / 2);
      let splitFill = colFill[splitX];
      for (let x = f.x + margin; x < f.x + f.w - margin; x++) {
        if (colFill[x] < splitFill) {
          splitFill = colFill[x];
          splitX = x;
        }
      }
      const left = { x: f.x, w: splitX - f.x };
      const right = { x: splitX, w: f.x + f.w - splitX };
      frames = [...frames.slice(0, idx), left, right, ...frames.slice(idx + 1)];
    } else {
      // Merge the pair with the smallest gap between them.
      let best = 0;
      let bestGap = Infinity;
      for (let i = 0; i < frames.length - 1; i++) {
        const g = frames[i + 1].x - (frames[i].x + frames[i].w);
        if (g < bestGap) {
          bestGap = g;
          best = i;
        }
      }
      const a = frames[best];
      const b = frames[best + 1];
      const combined = { x: a.x, w: b.x + b.w - a.x };
      frames = [...frames.slice(0, best), combined, ...frames.slice(best + 2)];
    }
  }
  return frames;
}

async function main() {
  const args = parseArgs();

  const img = await loadImage(args.input);
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

  const bd = sampleBackdrop(sctx);
  console.log(`backdrop sampled: rgb(${bd[0]}, ${bd[1]}, ${bd[2]}) a=${bd[3]}`);

  const bands = detectContentRows(sctx, W, H, bd, args.bgTol);
  console.log(`detected ${bands.length} content rows:`);
  bands.forEach((b, i) => console.log(`  row ${i}: y=${b.y} h=${b.h}`));

  if (bands.length !== args.rows.length) {
    console.error(
      `mismatch: detected ${bands.length} rows but --rows=${args.rows.join(",")} expects ${args.rows.length}`
    );
    process.exit(1);
  }

  // Per-row frame detection, reconciled to the user-specified count
  // (default 12, 12, 8 for a 32-frame KH sheet). The reconciler handles
  // touching characters (split) and over-broken silhouettes (merge).
  const frames: CharFrame[] = [];
  for (let r = 0; r < bands.length; r++) {
    const band = bands[r];
    const expected = args.rows[r];
    const bounds = detectFrameBounds(sctx, W, band, bd, args.bgTol, expected);
    console.log(`  row ${r}: ${bounds.length} frames (expected ${expected})`);
    for (const fb of bounds) {
      const cf = trimToCharacter(
        sctx,
        fb.x,
        band.y,
        fb.w,
        band.h,
        bd,
        args.bgTol
      );
      if (cf) frames.push(cf);
    }
  }
  console.log(`extracted ${frames.length} frames`);

  // Cell sizing:
  //   half  = max(maxLeft, maxRight) — symmetric padding around feet
  //   cellW = 2 * half (feet anchor lands at frame center column)
  //   cellH = max sh (every frame's feet sit at cellH-1)
  // Symmetric padding lets Phaser keep origin (0.5, 1): feet always at
  // (cellW/2, cellH-1), so the unit's tile position lines up with the
  // character's feet across every frame regardless of pose width.
  const maxLeft = frames.reduce((m, f) => Math.max(m, f.ax), 0);
  const maxRight = frames.reduce((m, f) => Math.max(m, f.sw - f.ax), 0);
  const half = Math.max(maxLeft, maxRight);
  const frameW = half * 2;
  const frameH = frames.reduce((m, f) => Math.max(m, f.sh), 0);
  const outW = frameW * frames.length;
  const out = createCanvas(outW, frameH);
  const octx = out.getContext("2d") as unknown as SKRSContext2D;
  octx.imageSmoothingEnabled = false;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
    // Place feet-anchor x at the cell's center column (half), feet y at
    // cellH - 1 (bottom).
    const dx = i * frameW + (half - f.ax);
    const dy = frameH - f.sh;
    octx.drawImage(
      img as unknown as Parameters<SKRSContext2D["drawImage"]>[0],
      f.sx,
      f.sy,
      f.sw,
      f.sh,
      dx,
      dy,
      f.sw,
      f.sh
    );
  }
  args.frameW = frameW;
  args.frameH = frameH;

  // Replace backdrop pixels with full transparency.
  const finalImg = octx.getImageData(0, 0, outW, args.frameH);
  const fd = finalImg.data;
  for (let p = 0; p < fd.length; p += 4) {
    if (isBackdrop(fd[p], fd[p + 1], fd[p + 2], fd[p + 3], bd, args.bgTol)) {
      fd[p + 3] = 0;
    }
  }
  octx.putImageData(finalImg, 0, 0);

  const sheetPath = resolve(args.outDir, `${args.role}_sheet.png`);
  mkdirSync(dirname(sheetPath), { recursive: true });
  writeFileSync(sheetPath, out.toBuffer("image/png"));

  // Still — frame 0 of the output sheet
  const still = createCanvas(args.frameW, args.frameH);
  const stCtx = still.getContext("2d") as unknown as SKRSContext2D;
  stCtx.imageSmoothingEnabled = false;
  stCtx.drawImage(
    out as unknown as Parameters<SKRSContext2D["drawImage"]>[0],
    0,
    0,
    args.frameW,
    args.frameH,
    0,
    0,
    args.frameW,
    args.frameH
  );
  writeFileSync(
    resolve(args.outDir, `${args.role}.png`),
    still.toBuffer("image/png")
  );

  console.log(`✓ ${sheetPath} (${outW}×${args.frameH})`);
  console.log(`  frame size: ${args.frameW}×${args.frameH}`);
}

void main();
