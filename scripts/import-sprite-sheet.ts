/**
 * Sprite-sheet importer. Takes a generated PNG that contains N frames
 * arranged horizontally (with optional label strip at the bottom) and
 * produces our format:
 *
 *   - <role>_sheet.png — N frames horizontal, each `frameW` × `frameH`
 *   - <role>.png       — single still (frame 0 of the sheet)
 *
 * The script auto-trims transparent borders and the bottom label strip,
 * then re-slices into N evenly-spaced frames.
 *
 * Usage:
 *   bun scripts/import-sprite-sheet.ts <input> <role> [--frames=8]
 *     [--frame-w=48] [--frame-h=64] [--bottom-crop=80]
 *
 * Example:
 *   bun scripts/import-sprite-sheet.ts /tmp/sora-raw.png sora
 */
import { createCanvas, loadImage, type SKRSContext2D } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

type Args = {
  input: string;
  role: string;
  frames: number;
  frameW: number;
  frameH: number;
  bottomCrop: number;
  outDir: string;
};

function parseArgs(): Args {
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
      "usage: bun scripts/import-sprite-sheet.ts <input.png> <role> [--frames=8] [--frame-w=48] [--frame-h=64] [--bottom-crop=auto]"
    );
    process.exit(1);
  }
  return {
    input,
    role,
    frames: Number(flags.get("frames") ?? 8),
    frameW: Number(flags.get("frame-w") ?? 48),
    frameH: Number(flags.get("frame-h") ?? 64),
    bottomCrop: Number(flags.get("bottom-crop") ?? 0),
    outDir: flags.get("out") ?? "assets/sprites/kh-default",
  };
}

// Find the bounding box of non-transparent (or non-white) pixels in a
// region of the source image. Treats near-white as background to handle
// AI generators that sometimes output solid white instead of transparent.
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
      const a = data[i + 3];
      // Treat fully-transparent OR near-white as background.
      const isBg =
        a < 16 || (r > 240 && g > 240 && b > 240);
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
  const args = parseArgs();
  const img = await loadImage(args.input);
  const W = img.width;
  const H = img.height;

  // Render the source onto a working canvas.
  const src = createCanvas(W, H);
  const sctx = src.getContext("2d") as unknown as SKRSContext2D;
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(img as unknown as Parameters<SKRSContext2D["drawImage"]>[0], 0, 0);

  // Auto-detect the content area, ignoring transparent / near-white
  // borders. This also strips the label row at the bottom if it's
  // separated by whitespace.
  const overall = findContentBox(sctx, 0, 0, W, H);
  if (!overall) {
    console.error("source image is empty");
    process.exit(1);
  }

  // If the user passed a bottom-crop value, apply it to the overall box.
  let workH = overall.h;
  if (args.bottomCrop > 0) {
    workH = Math.max(1, overall.h - args.bottomCrop);
  }

  // Slice horizontally into N strips. For each strip, find its content
  // box independently — characters often have varying widths per frame
  // (e.g. weapon raised → wider).
  const stripW = Math.floor(overall.w / args.frames);
  const frames: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < args.frames; i++) {
    const strip = findContentBox(
      sctx,
      overall.x + i * stripW,
      overall.y,
      stripW,
      workH
    );
    if (!strip) {
      console.error(`frame ${i} is empty — sheet probably has fewer frames`);
      process.exit(1);
    }
    frames.push(strip);
  }

  // Preserve native resolution — DO NOT downscale. The frame size is
  // dictated by the source. Pad to the largest content box so every
  // frame in the sheet has identical dimensions (Phaser spritesheets
  // require this).
  const maxW = frames.reduce((m, f) => Math.max(m, f.w), 0);
  const maxH = frames.reduce((m, f) => Math.max(m, f.h), 0);

  // If --frame-w / --frame-h were explicitly passed, honor them as
  // overrides; otherwise stick with native size.
  const wasOverridden = (k: string) =>
    process.argv.some((a) => a.startsWith(`--${k}=`));
  const targetW = wasOverridden("frame-w") ? args.frameW : maxW;
  const targetH = wasOverridden("frame-h") ? args.frameH : maxH;
  // Only scale if explicit overrides differ from native size.
  const scale =
    targetW === maxW && targetH === maxH
      ? 1
      : Math.min(targetW / maxW, targetH / maxH);

  const outW = targetW * args.frames;
  const out = createCanvas(outW, targetH);
  const octx = out.getContext("2d") as unknown as SKRSContext2D;
  octx.imageSmoothingEnabled = false;

  for (let i = 0; i < frames.length; i++) {
    const f = frames[i];
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

  // Replace any remaining near-white background pixels with full
  // transparency. Many AI generators output white instead of alpha.
  const finalImg = octx.getImageData(0, 0, outW, targetH);
  const fd = finalImg.data;
  for (let p = 0; p < fd.length; p += 4) {
    if (fd[p] > 240 && fd[p + 1] > 240 && fd[p + 2] > 240 && fd[p + 3] > 0) {
      fd[p + 3] = 0;
    }
  }
  octx.putImageData(finalImg, 0, 0);

  const sheetPath = resolve(args.outDir, `${args.role}_sheet.png`);
  writeFileSync(sheetPath, out.toBuffer("image/png"));
  console.log(`✓ ${sheetPath} (${outW}×${targetH}, ${args.frames} frames)`);

  // Single-frame still — frame 0 of the output sheet.
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
  const stillPath = resolve(args.outDir, `${args.role}.png`);
  writeFileSync(stillPath, still.toBuffer("image/png"));
  console.log(`✓ ${stillPath} (${targetW}×${targetH})`);
}

void main();
