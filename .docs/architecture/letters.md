# Letters & decree modal

The "letter" is realmkeeper's RW-themed unit of player-facing async messages. Permission requests, important notifications, and one-shot prompts all flow through it. This is the central UX surface for the player as **King**.

## Letter shape

Defined in `src/shared/events.ts`:

```ts
type Letter = {
  id: string;
  createdAt: number;
  severity: "critical" | "important" | "notable";
  title: string;
  body?: string;
  worldId?: string;
  sessionId?: string;          // some letters are kingdom-wide (no wielder)
  actions: { label: string; action: LetterAction }[];
  count?: number;              // collapsed-identical-letters within rate-limit window
  risk?: "low" | "elevated" | "high";   // permission letters
  reasoning?: string;          // wielder's last assistant_text — "what they were thinking"
};
```

## Severities and routing

| Severity | UI surface | Behavior |
|---|---|---|
| `critical` | `DecreeModal` (full-screen, blocking) | Cannot be dismissed without action. Permission requests usually land here |
| `important` | `AlertsHUD` (top-right) | Visible always, requires acknowledgement |
| `notable` | `LettersHUD` (bottom-right) | Stack of soft-dismissable cards |

Same `LetterCard` component renders inside all three surfaces.

## `LetterAction` taxonomy

```ts
type LetterAction =
  | { kind: "permission-allow"; requestId: string }
  | { kind: "permission-deny"; requestId: string; message?: string }
  | { kind: "permission-observe"; requestId: string }   // Cursor only
  | { kind: "iterate"; sessionId: string }              // run a standing order one more time
  | { kind: "comfort"; sessionId: string }              // calm a stuck wielder
  | { kind: "recall"; sessionId: string }               // kill the wielder
  | { kind: "send-word"; sessionId: string }            // open send-prompt UI
  | { kind: "dispatch"; worldId: string }               // open dispatch dialog
  | { kind: "dive"; worldId: string }                   // focus the camera
  | { kind: "seal"; worldId: string }                   // close the world
  | { kind: "dismiss" };                                // soft-close the letter
```

`store.applyLetterAction()` is the single dispatch — routes to AgentManager / panel-store / etc.

## Risk levels (permission letters)

`risk: "low" | "elevated" | "high"` auras card tinting and whether allow is single-click vs requires reasoning. We compute risk heuristically from tool name and inputs (e.g. `Bash` with `rm -rf` → high; `Read` of a config file → low). See `src/renderer/src/lettersmiths/` if it exists, otherwise the inline logic in the bridge normalizer.

## Permission-observe (Cursor exception)

Cursor's `beforeShellExecution` hook is advisory in allowlist mode (see [`../providers/cursor.md`](../providers/cursor.md)), so we can't pre-approve. The letter shows for **awareness only** with a `permission-observe` action that just dismisses — Cursor's own UI handles the real decision.

## DecreeModal

`src/renderer/src/ui/DecreeModal.tsx` — the full-screen blocking surface for `severity: "critical"` letters.

- Backdrop click does NOT dismiss (you must take an action)
- Esc does NOT dismiss either (intentional — the King has to read this)
- One letter at a time; queue of pending criticals shows count in the header
- Renders the same `LetterCard` as the HUDs but with bigger typography and explicit action buttons

## Interrupted-prompt heuristic (related)

When a wielder's user_prompt is followed by no work (no tool/text/permission) and then a NEXT user_prompt, we hide the first as "interrupted" — covers the King-edits-and-resends case.

Implementation: `src/renderer/src/ui/ConversationStream.tsx` `interruptedPromptIds`. Originally also treated `session_end` as a terminator, but that hid every Codex prompt whose response we missed (Codex's `Stop` hook maps to `session_end`). Now only the next user_prompt counts. See [`../providers/claude.md`](../providers/claude.md) § gaps.

## Adding a new letter type

1. Add a producer that constructs a `Letter` and calls `store.addLetter(letter)` (for kingdom-wide) or attaches via the per-wielder reducer
2. If introducing a new action, extend `LetterAction` in `src/shared/events.ts` and handle in `applyLetterAction()`
3. Pick the tier consciously — "critical" should be rare. Prefer "important" or "notable" unless action is genuinely blocking
