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

const FRAME_WIDTH = 32;
const FRAME_HEIGHT = 32;

const SHEET_URL = (role: UnitRole) => `/sprites/kh/${role}_sheet.png`;
const SHEET_TEXTURE = (role: UnitRole) => `kh-sheet-${role}`;
const IDLE_ANIM = (role: UnitRole) => `${role}-idle`;
const SWING_ANIM = (role: UnitRole) => `${role}-swing`;

export function registerSpritesheetPreload(scene: Phaser.Scene) {
  for (const role of UNIT_ROLES) {
    scene.load.spritesheet(SHEET_TEXTURE(role), SHEET_URL(role), {
      frameWidth: FRAME_WIDTH,
      frameHeight: FRAME_HEIGHT,
    });
  }
}

export function getSpritesheetConfig(role: UnitRole): {
  textureKey: string;
  frameWidth: number;
  frameHeight: number;
} {
  return {
    textureKey: SHEET_TEXTURE(role),
    frameWidth: FRAME_WIDTH,
    frameHeight: FRAME_HEIGHT,
  };
}

export function createRoleAnimations(
  anims: Phaser.Animations.AnimationManager,
  textures: Phaser.Textures.TextureManager
) {
  for (const role of UNIT_ROLES) {
    const textureKey = SHEET_TEXTURE(role);
    if (!textures.exists(textureKey)) continue;

    const tex = textures.get(textureKey);
    const frameCount = tex.getFrameNames().length;
    if (frameCount <= 1) continue;

    const half = Math.max(1, Math.floor(frameCount / 2));
    const idleKey = IDLE_ANIM(role);
    const swingKey = SWING_ANIM(role);

    if (!anims.exists(idleKey)) {
      anims.create({
        key: idleKey,
        frames: anims.generateFrameNumbers(textureKey, {
          start: 0,
          end: half - 1,
        }),
        frameRate: 6,
        repeat: -1,
      });
    }
    if (!anims.exists(swingKey) && frameCount > half) {
      anims.create({
        key: swingKey,
        frames: anims.generateFrameNumbers(textureKey, {
          start: half,
          end: frameCount - 1,
        }),
        frameRate: 12,
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
