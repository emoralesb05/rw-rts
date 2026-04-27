import type { UnitRole } from "@shared/events";

export const ROLE_PALETTE: Record<UnitRole, { color: number; label: string; faction: string }> = {
  // Claude — Keyblade Wielders + Royal Court
  sora: { color: 0xff5a3c, label: "Sora", faction: "Keyblade Wielder" },
  riku: { color: 0x9d6bff, label: "Riku", faction: "Keyblade Wielder" },
  kairi: { color: 0xffb86c, label: "Kairi", faction: "Keyblade Wielder" },
  donald: { color: 0x6cc6ff, label: "Donald", faction: "Royal Mage" },
  goofy: { color: 0x7af0c0, label: "Goofy", faction: "Royal Knight" },
  mickey: { color: 0xffd86b, label: "Mickey", faction: "King" },
  // Cursor — BBS / Days / Re:CoM
  ventus: { color: 0xfff4a6, label: "Ventus", faction: "Wayfinder" },
  aqua: { color: 0x4ec9ff, label: "Aqua", faction: "Wayfinder" },
  terra: { color: 0x9c6638, label: "Terra", faction: "Wayfinder" },
  roxas: { color: 0xeae0c8, label: "Roxas", faction: "Organization" },
  namine: { color: 0xf6d6ee, label: "Naminé", faction: "Witch" },
  // Codex — FF guests in KH
  cloud: { color: 0xc8b87a, label: "Cloud", faction: "FF Hero" },
  leon: { color: 0x6b4f3a, label: "Leon", faction: "FF Hero" },
  tifa: { color: 0xe7e7e7, label: "Tifa", faction: "FF Hero" },
  aerith: { color: 0xff89a3, label: "Aerith", faction: "FF Hero" },
  yuffie: { color: 0x6cd17a, label: "Yuffie", faction: "FF Hero" },
  // Generic fallbacks
  organization: { color: 0x111111, label: "XIII", faction: "Organization" },
  unversed: { color: 0x4d2cc6, label: "Vanitas", faction: "Unversed" },
};

export const ROLE_HEX: Record<UnitRole, string> = Object.fromEntries(
  Object.entries(ROLE_PALETTE).map(([k, v]) => [k, "#" + v.color.toString(16).padStart(6, "0")])
) as Record<UnitRole, string>;
