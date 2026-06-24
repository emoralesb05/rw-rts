import type { UnitRole } from "@shared/events";

// Four-warden system. Visual class info per archetype; the actual
// per-wielder display name is generated separately (see `nameFor` in
// `@shared/events`).
export const ROLE_PALETTE: Record<
  UnitRole,
  { color: number; label: string; faction: string }
> = {
  warden1: {
    color: 0x5a3878,
    label: "Warden",
    faction: "Guardian of Twilight",
  },
  warden2: {
    color: 0xc8a0d0,
    label: "Warden",
    faction: "Dreamweaver",
  },
  warden3: {
    color: 0xe07028,
    label: "Warden",
    faction: "Warden of Iron",
  },
  warden4: {
    color: 0x5cc8d8,
    label: "Warden",
    faction: "Wanderer of the Sea",
  },
};

export const ROLE_HEX: Record<UnitRole, string> = Object.fromEntries(
  Object.entries(ROLE_PALETTE).map(([k, v]) => [
    k,
    "#" + v.color.toString(16).padStart(6, "0"),
  ])
) as Record<UnitRole, string>;
