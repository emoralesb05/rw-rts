/**
 * Spritesheet loader + animation builder for the four-warden system.
 *
 * Convention: drop `assets/sprites/rw/<role>_sheet.png` as a 32-frame
 * spritesheet at 96×144 per frame (3072×144 total). Frame layout:
 *
 *   0..3   idle (front)
 *   4..7   idle (back)
 *   8..11  idle (side, right-facing — game flips for left)
 *   12..15 walk down (toward camera)
 *   16..19 walk up (away from camera)
 *   20..23 walk side (right-facing — game flips for left)
 *   24..27 attack (windup → strike → peak → recover)
 *   28..31 cast / special (charge → release → peak → recover)
 *
 * Single-frame stills (`<role>.png`) are also accepted as a fallback
 * still image when no sheet is loaded.
 *
 * Roles without a sheet fall back to the still-image override
 * (`<role>.png`), and finally to drawn primitives.
 */

import type * as Phaser from "phaser";
import type { UnitRole } from "@shared/events";
import { UNIT_ROLES, SPRITE_URL } from "./draw";
import { publicAsset, shouldProbeOptionalPublicAssets } from "../public-asset";

// Per-role frame dimensions. Each AI-gen concept sheet comes back at a
// different native resolution, so the no-scale extractor preserves
// whatever pixel size the source authored at. Phaser's spritesheet
// loader needs the frame size at preload time, so we maintain an
// explicit map per role rather than reading the texture after load.
// In-world display scale (WorldScene.populateBody) normalizes
// on-screen size across roles.
const FRAME_DIMS: Record<UnitRole, { width: number; height: number }> = {
  warden1: { width: 310, height: 198 },
  warden2: { width: 282, height: 226 },
  warden3: { width: 292, height: 201 },
  warden4: { width: 302, height: 215 },
};
const FRAMES_PER_SHEET = 32;

const SHEET_URL = (role: UnitRole) =>
  publicAsset(`sprites/rw/${role}_sheet.png`);
const SHEET_DEFAULT_URL = (role: UnitRole) =>
  publicAsset(`sprites/rw-default/${role}_sheet.png`);
const SHEET_TEXTURE = (role: UnitRole) => `rw-sheet-${role}`;
const SHEET_DEFAULT_TEXTURE = (role: UnitRole) => `rw-default-sheet-${role}`;

// Probe which user overrides exist in /sprites/rw/ at module load. Phaser's
// loader logs console.error for 404s, and there's no way to suppress per-file.
// The probe runs once, before the scene preloads, so we can skip registering
// missing override URLs entirely. Server-backed launches usually resolve these
// before React mounts and Phaser boots.
//
// Vite's dev server returns 200 with text/html (SPA fallback) for missing
// static files, so r.ok alone isn't sufficient — must also check that the
// response actually has an image content-type.
const overrideAvailable = new Set<UnitRole>();
const isImage = async (url: string): Promise<boolean> => {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
};
if (shouldProbeOptionalPublicAssets()) {
  void Promise.all(
    UNIT_ROLES.map(async (role) => {
      const [still, sheet] = await Promise.all([
        isImage(SPRITE_URL(role)),
        isImage(SHEET_URL(role)),
      ]);
      if (still || sheet) overrideAvailable.add(role);
    })
  );
}

export function hasOverride(role: UnitRole): boolean {
  return overrideAvailable.has(role);
}

// Named animation keys per role.
export const ANIM = {
  idleFront: (r: UnitRole) => `${r}-idle-front`,
  idleBack: (r: UnitRole) => `${r}-idle-back`,
  idleSide: (r: UnitRole) => `${r}-idle-side`,
  walkDown: (r: UnitRole) => `${r}-walk-down`,
  walkUp: (r: UnitRole) => `${r}-walk-up`,
  walkSide: (r: UnitRole) => `${r}-walk-side`,
  attack: (r: UnitRole) => `${r}-attack`,
  cast: (r: UnitRole) => `${r}-cast`,
} as const;

// Frame ranges within a 32-frame sheet.
const RANGES: {
  key: keyof typeof ANIM;
  from: number;
  to: number;
  loop: boolean;
  rate: number;
}[] = [
  { key: "idleFront", from: 0, to: 3, loop: true, rate: 4 },
  { key: "idleBack", from: 4, to: 7, loop: true, rate: 4 },
  { key: "idleSide", from: 8, to: 11, loop: true, rate: 4 },
  { key: "walkDown", from: 12, to: 15, loop: true, rate: 8 },
  { key: "walkUp", from: 16, to: 19, loop: true, rate: 8 },
  { key: "walkSide", from: 20, to: 23, loop: true, rate: 8 },
  { key: "attack", from: 24, to: 27, loop: false, rate: 12 },
  { key: "cast", from: 28, to: 31, loop: false, rate: 10 },
];

export function registerSpritesheetPreload(scene: Phaser.Scene) {
  // Always load shipped defaults from rw-default/ (the canonical art).
  // Only register rw/ overrides for roles that actually have files —
  // probed at module load. getSpritesheetConfig prefers override → default.
  for (const role of UNIT_ROLES) {
    const dims = FRAME_DIMS[role];
    scene.load.spritesheet(
      SHEET_DEFAULT_TEXTURE(role),
      SHEET_DEFAULT_URL(role),
      {
        frameWidth: dims.width,
        frameHeight: dims.height,
      }
    );
    if (hasOverride(role)) {
      scene.load.spritesheet(SHEET_TEXTURE(role), SHEET_URL(role), {
        frameWidth: dims.width,
        frameHeight: dims.height,
      });
    }
  }
}

// Returns the loaded sheet for this role — user override wins, then shipped
// default, then null. Caller checks textures.exists before using.
export function getSpritesheetConfig(
  role: UnitRole,
  textures?: Phaser.Textures.TextureManager
): {
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
} | null {
  const overrideKey = SHEET_TEXTURE(role);
  const defaultKey = SHEET_DEFAULT_TEXTURE(role);
  const dims = FRAME_DIMS[role];
  if (textures) {
    if (textures.exists(overrideKey)) {
      return {
        textureKey: overrideKey,
        frameWidth: dims.width,
        frameHeight: dims.height,
      };
    }
    if (textures.exists(defaultKey)) {
      return {
        textureKey: defaultKey,
        frameWidth: dims.width,
        frameHeight: dims.height,
      };
    }
    return null;
  }
  return {
    textureKey: overrideKey,
    frameWidth: dims.width,
    frameHeight: dims.height,
  };
}

export function createRoleAnimations(
  anims: Phaser.Animations.AnimationManager,
  textures: Phaser.Textures.TextureManager
) {
  for (const role of UNIT_ROLES) {
    const cfg = getSpritesheetConfig(role, textures);
    if (!cfg) continue;
    const tex = textures.get(cfg.textureKey);
    const frameCount = tex.getFrameNames().length;
    if (frameCount < 1) continue;

    // Full 32-frame sheet → build the named ranges. If the sheet has
    // fewer frames (e.g. legacy 8-frame procedural), fall back to a
    // single idle anim covering whatever exists.
    if (frameCount >= FRAMES_PER_SHEET) {
      for (const r of RANGES) {
        const animKey = ANIM[r.key](role);
        if (anims.exists(animKey)) anims.remove(animKey);
        anims.create({
          key: animKey,
          frames: anims.generateFrameNumbers(cfg.textureKey, {
            start: r.from,
            end: r.to,
          }),
          frameRate: r.rate,
          repeat: r.loop ? -1 : 0,
        });
      }
    } else {
      // Legacy / short sheet — just one idle anim across all frames so
      // populateBody doesn't break while sheets are still being
      // produced.
      const animKey = ANIM.idleFront(role);
      if (anims.exists(animKey)) anims.remove(animKey);
      anims.create({
        key: animKey,
        frames: anims.generateFrameNumbers(cfg.textureKey, {
          start: 0,
          end: frameCount - 1,
        }),
        frameRate: 6,
        repeat: -1,
      });
    }
  }
}

// Convenience accessor — default idle animation for a role.
export function getIdleAnimKey(role: UnitRole): string {
  return ANIM.idleFront(role);
}

// Backward-compat re-export — older code referenced `getSwingAnimKey`.
export function getSwingAnimKey(role: UnitRole): string {
  return ANIM.attack(role);
}
