/**
 * Tiny localStorage helper for HUD preferences that should survive
 * across app reloads — collapsed widget state, "show ghosted wielders"
 * toggle, etc. Keep keys namespaced with `keykeeper:hud:` so they don't
 * collide with anything else (existing example: `keykeeper:muted`).
 *
 * Errors swallowed silently — a corrupted/disabled localStorage just
 * falls back to the default value.
 */
import { useEffect, useState } from "react";

const PREFIX = "keykeeper:hud:";

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    localStorage.setItem(PREFIX + key, value ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Persist a boolean preference under the given key. Returns the
 * familiar [value, setValue] tuple. */
export function usePersistedBool(
  key: string,
  defaultValue: boolean
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(() => readBool(key, defaultValue));
  useEffect(() => {
    writeBool(key, value);
  }, [key, value]);
  return [value, setValue];
}
