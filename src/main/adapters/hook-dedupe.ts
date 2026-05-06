import type { HookPayload } from "@shared/schemas";

const DEDUPE_TTL_MS = 1500;

// User-prompt events get a longer window because the upstream double-
// fire pattern is different: when the King interrupts a Claude/Cursor
// turn and resends the same text (Esc -> re-submit), the second
// UserPromptSubmit / beforeSubmitPrompt fires seconds later, not
// milliseconds. 12s catches the typical interrupt-edit-resend gap
// without false-positiving deliberate same-prompt repeats (rare).
const PROMPT_DEDUPE_TTL_MS = 12_000;

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function dedupeHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h.toString(36);
}

function dedupeKeyFor(payload: HookPayload, eventName: string): string {
  const sessionId =
    nonEmptyString(payload.session_id) ??
    nonEmptyString(payload.sessionId) ??
    nonEmptyString(payload.conversation_id) ??
    nonEmptyString(payload.transcript_path) ??
    "";
  const toolUseId = nonEmptyString(payload.tool_use_id);
  if (toolUseId) return `${eventName}:${sessionId}:tu:${toolUseId}`;
  // Hash the full payload minus our own marker. Two distinct user
  // prompts will differ at least in their prompt text; two fires of
  // the same logical event have identical payloads from the upstream.
  // Hashing a curated subset (`prompt`/`tool_name`/etc.) was too loose
  // because it false-positived distinct Claude prompts whose text lived
  // in a field name we had not anticipated.
  const sanitized: Record<string, unknown> = {};
  for (const k of Object.keys(payload)) {
    if (k === "__kh_permission_request_id") continue;
    sanitized[k] = payload[k];
  }
  const sig = dedupeHash(JSON.stringify(sanitized));
  return `${eventName}:${sessionId}:${sig}`;
}

export function createHookDedupe() {
  const recentEventKeys = new Map<string, number>();

  return {
    isDuplicate(payload: HookPayload, eventName: string, now = Date.now()): boolean {
      if (recentEventKeys.size > 200) {
        for (const [k, exp] of recentEventKeys) {
          if (exp <= now) recentEventKeys.delete(k);
        }
      }
      const key = dedupeKeyFor(payload, eventName);
      const existing = recentEventKeys.get(key);
      if (existing && existing > now) return true;
      const ttl =
        eventName === "UserPromptSubmit" || eventName === "beforeSubmitPrompt"
          ? PROMPT_DEDUPE_TTL_MS
          : DEDUPE_TTL_MS;
      recentEventKeys.set(key, now + ttl);
      return false;
    },
    clear() {
      recentEventKeys.clear();
    },
  };
}
