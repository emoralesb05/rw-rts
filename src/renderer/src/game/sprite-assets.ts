/**
 * Spritesheet loader + animation builder.
 *
 * Convention: drop `assets/sprites/kh/<role>_sheet.png` as a spritesheet of
 * 32×32 frames. We auto-create two animations per role:
 *   - <role>-idle   loops the first half of frames
 *   - <role>-swing  plays the second half once
 *
 * Sheets with a single frame are treated as a still image (no animation).
 * Roles without a sheet fall back to the still-image override
 * (`<role>.png`), and finally to drawn primitives.
 */

import * as Phaser from "phaser";
import type { UnitRole } from "@shared/events";
import { UNIT_ROLES } from "./draw";

// Generated sheets are 96×128 per frame, 8 frames horizontal.
// Frames 0..3 = idle bob, frames 4..7 = swing.
const FRAME_WIDTH = 96;
const FRAME_HEIGHT = 128;

const SHEET_URL = (role: UnitRole) => `/sprites/kh/${role}_sheet.png`;
const SHEET_DEFAULT_URL = (role: UnitRole) =>
  `/sprites/kh-default/${role}_sheet.png`;
const SHEET_TEXTURE = (role: UnitRole) => `kh-sheet-${role}`;
const SHEET_DEFAULT_TEXTURE = (role: UnitRole) => `kh-default-sheet-${role}`;
const IDLE_ANIM = (role: UnitRole) => `${role}-idle`;
const SWING_ANIM = (role: UnitRole) => `${role}-swing`;

export function registerSpritesheetPreload(scene: Phaser.Scene) {
  for (const role of UNIT_ROLES) {
    scene.load.spritesheet(SHEET_TEXTURE(role), SHEET_URL(role), {
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });
    scene.load.spritesheet(SHEET_DEFAULT_TEXTURE(role), SHEET_DEFAULT_URL(role), {
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });
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
  if (textures) {
    if (textures.exists(overrideKey)) {
      return { textureKey: overrideKey, frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT };
    }
    if (textures.exists(defaultKey)) {
      return { textureKey: defaultKey, frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT };
    }
    return null;
  }
  // Back-compat for callers that don't pass textures
  return { textureKey: overrideKey, frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT };
}

export function createRoleAnimations(
  anims: Phaser.Animations.AnimationManager,
  textures: Phaser.Textures.TextureManager
) {
  for (const role of UNIT_ROLES) {
    const cfg = getSpritesheetConfig(role, textures);
    if (!cfg) continue;
    const textureKey = cfg.textureKey;
    const tex = textures.get(textureKey);
    const frameCount = tex.getFrameNames().length;
    if (frameCount <= 1) continue;

    const half = Math.max(1, Math.floor(frameCount / 2));
    const idleKey = IDLE_ANIM(role);
    const swingKey = SWING_ANIM(role);

    if (anims.exists(idleKey)) anims.remove(idleKey);
    anims.create({
      key: idleKey,
      frames: anims.generateFrameNumbers(textureKey, { start: 0, end: half - 1 }),
      frameRate: 6,
      repeat: -1,
    });
    if (anims.exists(swingKey)) anims.remove(swingKey);
    if (frameCount > half) {
      anims.create({
        key: swingKey,
        frames: anims.generateFrameNumbers(textureKey, {
          start: half,
          end: frameCount - 1,
        }),
        frameRate: 14,
        repeat: 0,
      });
    }
  }
}

export function getIdleAnimKey(role: UnitRole): string {
  return IDLE_ANIM(role);
}

export function getSwingAnimKey(role: UnitRole): string {
  return SWING_ANIM(role);
}
