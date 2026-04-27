import type { UnitRole } from "@shared/events";

export const ROLE_PALETTE: Record<UnitRole, { color: number; label: string; faction: string }> = {
  sora: { color: 0xff5a3c, label: "Sora", faction: "Keyblade Wielder" },
  riku: { color: 0x9d6bff, label: "Riku", faction: "Keyblade Wielder" },
  kairi: { color: 0xffb86c, label: "Kairi", faction: "Keyblade Wielder" },
  donald: { color: 0x6cc6ff, label: "Donald", faction: "Royal Mage" },
  goofy: { color: 0x7af0c0, label: "Goofy", faction: "Royal Knight" },
  organization: { color: 0x111111, label: "XIII", faction: "Organization" },
  unversed: { color: 0x4d2cc6, label: "?", faction: "Unversed" },
};

export const ROLE_HEX: Record<UnitRole, string> = Object.fromEntries(
  Object.entries(ROLE_PALETTE).map(([k, v]) => [k, "#" + v.color.toString(16).padStart(6, "0")])
) as Record<UnitRole, string>;
