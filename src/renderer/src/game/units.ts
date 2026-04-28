import type { UnitRole } from "@shared/events";

// Four-keyblader system. Visual class info per archetype; the actual
// per-wielder display name is generated separately (see `nameFor` in
// `@shared/events`).
export const ROLE_PALETTE: Record<
  UnitRole,
  { color: number; label: string; faction: string }
> = {
  keyblader1: {
    color: 0x5a3878,
    label: "Keyblader",
    faction: "Guardian of Twilight",
  },
  keyblader2: {
    color: 0xc8a0d0,
    label: "Keyblader",
    faction: "Dreamweaver",
  },
  keyblader3: {
    color: 0xe07028,
    label: "Keyblader",
    faction: "Warden of Iron",
  },
  keyblader4: {
    color: 0x5cc8d8,
    label: "Keyblader",
    faction: "Wanderer of the Sea",
  },
};

export const ROLE_HEX: Record<UnitRole, string> = Object.fromEntries(
  Object.entries(ROLE_PALETTE).map(([k, v]) => [
    k,
    "#" + v.color.toString(16).padStart(6, "0"),
  ])
) as Record<UnitRole, string>;
