export const MONITOR_FRESHNESS = {
  eventFreshMs: 30_000,
  eventOfflineMs: 5 * 60_000,
  providerFreshMs: 15_000,
  providerOfflineMs: 60_000,
  terminalRetentionMs: 24 * 60 * 60_000,
} as const;

export const MONITOR_AUTHORITY_WEIGHT = {
  heuristic: 1,
  authoritative: 2,
  provider: 3,
  blocking: 4,
} as const;
