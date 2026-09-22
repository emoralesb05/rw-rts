import * as Phaser from "phaser";
import type { WorldTheme } from "./realm-worlds";

export const WORLD_MAP_GRID = 6;

type TileTone = "." | "g" | "p" | "a";
type GridPoint = readonly [tx: number, ty: number];

type WorldPropKind =
  | "banner"
  | "beacon"
  | "brazier"
  | "crystal"
  | "dock"
  | "house"
  | "market"
  | "obelisk"
  | "rock"
  | "ruin"
  | "shrine"
  | "spire"
  | "tree"
  | "watchtower"
  | "wall";

export type WorldMapProp = {
  kind: WorldPropKind;
  at: GridPoint;
  scale?: number;
  variant?: number;
};

export type WorldMapDesign = {
  tiles: readonly string[];
  props: readonly WorldMapProp[];
};

const WORLD_MAP_DESIGNS: Record<WorldTheme, WorldMapDesign> = {
  citadel: {
    tiles: [".gggg.", "ggppgg", "gpaaag", "gaaapg", "ggppgg", ".gggg."],
    props: [
      { kind: "watchtower", at: [0.65, 1.1], scale: 0.82 },
      { kind: "watchtower", at: [4.35, 1.1], scale: 0.82 },
      { kind: "wall", at: [1.15, 4.55], scale: 0.9 },
      { kind: "wall", at: [3.85, 4.55], scale: 0.9, variant: 1 },
      { kind: "banner", at: [1.25, 2.65], scale: 0.9 },
      { kind: "banner", at: [3.75, 2.65], scale: 0.9, variant: 1 },
    ],
  },
  bastion: {
    tiles: ["gg..gg", "ggppgg", ".paaap", ".paaap", "ggppgg", "gg..gg"],
    props: [
      { kind: "crystal", at: [0.7, 0.7], scale: 1.05 },
      { kind: "crystal", at: [4.3, 0.7], scale: 0.88, variant: 1 },
      { kind: "obelisk", at: [0.85, 4.25], scale: 0.84 },
      { kind: "obelisk", at: [4.15, 4.25], scale: 0.84, variant: 1 },
      { kind: "wall", at: [1.25, 2.55], scale: 0.82 },
      { kind: "wall", at: [3.75, 2.55], scale: 0.82, variant: 1 },
    ],
  },
  crossroads: {
    tiles: [".gppg.", "ggppgg", "ppaaap", "paaapp", "ggppgg", ".gppg."],
    props: [
      { kind: "house", at: [0.65, 1.25], scale: 0.9 },
      { kind: "house", at: [4.35, 1.15], scale: 0.82, variant: 1 },
      { kind: "market", at: [0.8, 4.2], scale: 0.92 },
      { kind: "market", at: [4.2, 4.15], scale: 0.84, variant: 1 },
      { kind: "beacon", at: [1.35, 2.45], scale: 0.76 },
      { kind: "beacon", at: [3.65, 2.55], scale: 0.76, variant: 1 },
    ],
  },
  tide: {
    tiles: ["..gg..", ".gppgg", "gppagg", "ggaapg", "ggppg.", "..gg.."],
    props: [
      { kind: "dock", at: [0.65, 2.75], scale: 1.04 },
      { kind: "dock", at: [4.35, 2.25], scale: 0.92, variant: 1 },
      { kind: "shrine", at: [1.35, 1.15], scale: 0.82 },
      { kind: "rock", at: [3.95, 4.15], scale: 0.92 },
      { kind: "rock", at: [1.05, 4.45], scale: 0.68, variant: 1 },
    ],
  },
  dusk: {
    tiles: ["..gg..", ".gppg.", "gpaapg", "gpaapg", ".gppg.", "..gg.."],
    props: [
      { kind: "ruin", at: [0.9, 2.2], scale: 0.88 },
      { kind: "ruin", at: [4.1, 2.8], scale: 0.82, variant: 1 },
      { kind: "tree", at: [1.3, 4.0], scale: 0.86 },
      { kind: "tree", at: [3.75, 1.05], scale: 0.72, variant: 1 },
      { kind: "obelisk", at: [3.7, 4.15], scale: 0.7 },
    ],
  },
  lantern: {
    tiles: [".gggg.", "ggppgg", ".paapg", "gpaap.", "ggppgg", ".gggg."],
    props: [
      { kind: "spire", at: [0.8, 1.25], scale: 0.9 },
      { kind: "spire", at: [4.2, 3.8], scale: 0.82, variant: 1 },
      { kind: "brazier", at: [1.25, 4.2], scale: 0.84 },
      { kind: "brazier", at: [3.75, 0.85], scale: 0.84, variant: 1 },
      { kind: "ruin", at: [4.2, 1.15], scale: 0.68 },
    ],
  },
};

const TILE_TINTS: Record<WorldTheme, Record<Exclude<TileTone, ".">, number>> = {
  citadel: { g: 0x90b5ed, p: 0xbed5f3, a: 0xe7d18a },
  bastion: { g: 0x493673, p: 0x7657ad, a: 0xb99ae8 },
  crossroads: { g: 0x875331, p: 0xb97741, a: 0xe0b066 },
  tide: { g: 0x659bc0, p: 0xa8cee0, a: 0xead9ac },
  dusk: { g: 0x82506d, p: 0xb2738b, a: 0xd69a9b },
  lantern: { g: 0x4f335f, p: 0x79507c, a: 0xbc6649 },
};

const PROP_COLORS: Record<
  WorldTheme,
  { top: number; left: number; right: number; accent: number; glow: number }
> = {
  citadel: {
    top: 0xc8d9ec,
    left: 0x6883a7,
    right: 0x435d83,
    accent: 0xffd86b,
    glow: 0x6cc6ff,
  },
  bastion: {
    top: 0x8e72bd,
    left: 0x4e3979,
    right: 0x2b2150,
    accent: 0xc9a4ff,
    glow: 0xffd86b,
  },
  crossroads: {
    top: 0xc28a5a,
    left: 0x75452d,
    right: 0x4e2c26,
    accent: 0xffd86b,
    glow: 0xffb86c,
  },
  tide: {
    top: 0xbad7dc,
    left: 0x5b8ca0,
    right: 0x315d74,
    accent: 0xf6d6a8,
    glow: 0x6cc6ff,
  },
  dusk: {
    top: 0xba899b,
    left: 0x71435d,
    right: 0x45263f,
    accent: 0xff9fb5,
    glow: 0xffd86b,
  },
  lantern: {
    top: 0x8e627f,
    left: 0x55314f,
    right: 0x321d38,
    accent: 0xff7a4a,
    glow: 0xffb86c,
  },
};

export function worldMapDesignFor(theme: WorldTheme): WorldMapDesign {
  return WORLD_MAP_DESIGNS[theme];
}

export function worldTileTone(
  theme: WorldTheme,
  x: number,
  y: number
): TileTone {
  return (
    (WORLD_MAP_DESIGNS[theme].tiles[y]?.[x] as TileTone | undefined) ?? "."
  );
}

export function worldTileTint(theme: WorldTheme, tone: Exclude<TileTone, ".">) {
  return TILE_TINTS[theme][tone];
}

type IsoToLocal = (tx: number, ty: number) => { x: number; y: number };

function drawIsoBlock(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: { top: number; left: number; right: number }
) {
  const half = width / 2;
  const topY = y - height;
  g.fillStyle(colors.left, 0.96);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(x - half, topY),
      new Phaser.Math.Vector2(x, topY + half * 0.42),
      new Phaser.Math.Vector2(x, y + half * 0.42),
      new Phaser.Math.Vector2(x - half, y),
    ],
    true
  );
  g.fillStyle(colors.right, 0.96);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(x + half, topY),
      new Phaser.Math.Vector2(x, topY + half * 0.42),
      new Phaser.Math.Vector2(x, y + half * 0.42),
      new Phaser.Math.Vector2(x + half, y),
    ],
    true
  );
  g.fillStyle(colors.top, 1);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(x, topY - half * 0.42),
      new Phaser.Math.Vector2(x + half, topY),
      new Phaser.Math.Vector2(x, topY + half * 0.42),
      new Phaser.Math.Vector2(x - half, topY),
    ],
    true
  );
}

function drawWorldProp(
  g: Phaser.GameObjects.Graphics,
  prop: WorldMapProp,
  theme: WorldTheme,
  isoToLocal: IsoToLocal
) {
  const point = isoToLocal(prop.at[0] + 0.5, prop.at[1] + 0.5);
  const colors = PROP_COLORS[theme];
  const variant = prop.variant ?? 0;
  g.save();
  g.translateCanvas(point.x, point.y - 2);
  g.scaleCanvas(prop.scale ?? 1, prop.scale ?? 1);
  g.fillStyle(0x01040b, 0.42);
  g.fillEllipse(0, 4, 42, 12);

  if (prop.kind === "watchtower") {
    drawIsoBlock(g, 0, 0, 28, 34, colors);
    drawIsoBlock(g, 0, -31, 38, 9, colors);
    g.fillStyle(colors.accent, 0.9);
    g.fillTriangle(-18, -42, -11, -52, -6, -40);
    g.fillTriangle(18, -42, 11, -52, 6, -40);
  } else if (prop.kind === "wall") {
    drawIsoBlock(g, 0, 2, 54, 13, colors);
    g.lineStyle(2, colors.accent, 0.5);
    g.lineBetween(-24, -13, 24, -13);
  } else if (prop.kind === "banner") {
    g.lineStyle(3, colors.top, 0.95);
    g.lineBetween(0, 2, 0, -44);
    g.fillStyle(variant ? colors.glow : colors.accent, 0.88);
    g.fillTriangle(2, -42, 28, -35, 2, -25);
  } else if (prop.kind === "crystal") {
    g.fillStyle(colors.glow, 0.16);
    g.fillEllipse(0, -8, 44, 28);
    g.fillStyle(colors.accent, 0.92);
    g.fillTriangle(0, -52, -13, 0, 10, -7);
    g.fillStyle(colors.top, 0.9);
    g.fillTriangle(-4, -40, -24, 2, -9, -4);
    g.fillTriangle(8, -34, 24, 2, 10, -4);
  } else if (prop.kind === "obelisk") {
    drawIsoBlock(g, 0, 0, 18, 46, colors);
    g.fillStyle(colors.accent, 0.88);
    g.fillTriangle(0, -62, -9, -46, 9, -46);
  } else if (prop.kind === "house") {
    drawIsoBlock(g, 0, 2, 34, 24, colors);
    g.fillStyle(variant ? colors.glow : colors.accent, 0.92);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(0, -47),
        new Phaser.Math.Vector2(25, -26),
        new Phaser.Math.Vector2(0, -14),
        new Phaser.Math.Vector2(-25, -26),
      ],
      true
    );
    g.fillStyle(0x140d16, 0.88);
    g.fillRect(-4, -15, 8, 17);
  } else if (prop.kind === "market") {
    g.lineStyle(3, colors.left, 0.9);
    g.lineBetween(-19, 1, -16, -26);
    g.lineBetween(19, 1, 16, -26);
    g.fillStyle(variant ? colors.glow : colors.accent, 0.86);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(-27, -26),
        new Phaser.Math.Vector2(0, -39),
        new Phaser.Math.Vector2(27, -26),
        new Phaser.Math.Vector2(0, -14),
      ],
      true
    );
  } else if (prop.kind === "beacon") {
    g.lineStyle(2, colors.accent, 0.65);
    g.strokeEllipse(0, -5, 34, 15);
    g.strokeEllipse(0, -5, 52, 23);
    drawIsoBlock(g, 0, 2, 14, 23, colors);
    g.fillStyle(colors.glow, 0.9);
    g.fillCircle(0, -29, 5);
  } else if (prop.kind === "dock") {
    g.lineStyle(4, colors.top, 0.9);
    for (let i = -2; i <= 2; i++) {
      g.lineBetween(-34 + i * 8, -11 + i * 3, 24 + i * 8, 13 + i * 3);
    }
    g.lineStyle(2, colors.accent, 0.72);
    g.lineBetween(-31, -15, 31, 11);
    g.lineBetween(-24, -2, 38, 24);
  } else if (prop.kind === "shrine") {
    drawIsoBlock(g, 0, 3, 34, 10, colors);
    drawIsoBlock(g, 0, -5, 13, 30, colors);
    g.lineStyle(2, colors.glow, 0.76);
    g.strokeCircle(0, -39, 10);
    g.fillStyle(colors.accent, 0.86);
    g.fillCircle(0, -39, 3);
  } else if (prop.kind === "rock") {
    g.fillStyle(colors.right, 0.95);
    g.fillPoints(
      [
        new Phaser.Math.Vector2(-24, 2),
        new Phaser.Math.Vector2(-12, -25),
        new Phaser.Math.Vector2(8, -31),
        new Phaser.Math.Vector2(25, -7),
        new Phaser.Math.Vector2(18, 5),
      ],
      true
    );
    g.lineStyle(1.5, colors.glow, 0.5);
    g.lineBetween(-11, -22, 5, -8);
  } else if (prop.kind === "ruin") {
    drawIsoBlock(g, -13, 3, 12, 34, colors);
    drawIsoBlock(g, 14, 5, 12, variant ? 22 : 28, colors);
    g.lineStyle(4, colors.top, 0.72);
    g.lineBetween(-18, -32, 18, -22);
    g.lineStyle(1.5, colors.accent, 0.46);
    g.strokeEllipse(0, 1, 54, 18);
  } else if (prop.kind === "tree") {
    drawIsoBlock(g, 0, 4, 9, 25, colors);
    g.fillStyle(variant ? colors.right : colors.left, 0.98);
    g.fillCircle(-9, -28, 16);
    g.fillCircle(9, -31, 18);
    g.fillStyle(colors.top, 0.92);
    g.fillCircle(0, -44, 17);
  } else if (prop.kind === "spire") {
    g.fillStyle(colors.right, 0.96);
    g.fillTriangle(0, -68, -23, 3, 4, -8);
    g.fillStyle(colors.left, 0.96);
    g.fillTriangle(0, -68, 23, 3, 4, -8);
    g.lineStyle(2, colors.accent, 0.72);
    g.lineBetween(0, -62, 0, -12);
  } else if (prop.kind === "brazier") {
    drawIsoBlock(g, 0, 4, 18, 13, colors);
    g.fillStyle(colors.accent, 0.94);
    g.fillTriangle(0, -37, -10, -8, 1, -15);
    g.fillStyle(colors.glow, 0.88);
    g.fillTriangle(1, -29, -4, -9, 8, -12);
  }

  g.restore();
}

export function drawWorldMapEnvironment(
  scene: Phaser.Scene,
  plane: Phaser.GameObjects.Container,
  theme: WorldTheme,
  isoToLocal: IsoToLocal
) {
  const design = WORLD_MAP_DESIGNS[theme];
  const district = scene.add.graphics();
  const props = scene.add.graphics();

  for (let y = 0; y < WORLD_MAP_GRID; y++) {
    for (let x = 0; x < WORLD_MAP_GRID; x++) {
      const tone = worldTileTone(theme, x, y);
      if (tone !== "p" && tone !== "a") continue;
      const top = isoToLocal(x, y);
      const right = isoToLocal(x + 1, y);
      const bottom = isoToLocal(x + 1, y + 1);
      const left = isoToLocal(x, y + 1);
      const color =
        tone === "a" ? PROP_COLORS[theme].accent : PROP_COLORS[theme].glow;
      district.fillStyle(color, tone === "a" ? 0.2 : 0.11);
      district.fillPoints(
        [
          new Phaser.Math.Vector2(top.x, top.y),
          new Phaser.Math.Vector2(right.x, right.y),
          new Phaser.Math.Vector2(bottom.x, bottom.y),
          new Phaser.Math.Vector2(left.x, left.y),
        ],
        true
      );
      district.lineStyle(1, color, tone === "a" ? 0.48 : 0.24);
      district.strokePoints(
        [
          new Phaser.Math.Vector2(top.x, top.y),
          new Phaser.Math.Vector2(right.x, right.y),
          new Phaser.Math.Vector2(bottom.x, bottom.y),
          new Phaser.Math.Vector2(left.x, left.y),
        ],
        true
      );
    }
  }

  const plaza = isoToLocal(WORLD_MAP_GRID / 2, WORLD_MAP_GRID / 2);
  district.lineStyle(1.6, PROP_COLORS[theme].accent, 0.46);
  district.strokeEllipse(plaza.x, plaza.y + 13, 96, 36);
  district.lineStyle(1, PROP_COLORS[theme].glow, 0.28);
  district.strokeEllipse(plaza.x, plaza.y + 13, 126, 48);

  for (const prop of design.props) {
    drawWorldProp(props, prop, theme, isoToLocal);
  }

  plane.add([district, props]);
}
