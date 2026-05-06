export type UnitIdentitySource = {
  tool: string;
  cwd: string;
  repoRoot?: string;
};

/** Stable wielder identity — same across session restarts. */
export function unitIdentityFor(tool: string, cwdOrRepo: string): string {
  return `${tool}::${cwdOrRepo}`;
}

/** Use repo root when available so subdirectory sessions share identity. */
export function unitIdentityForUnit(unit: UnitIdentitySource): string {
  return unitIdentityFor(unit.tool, unit.repoRoot ?? unit.cwd);
}
