# Plan: Multi-choice permissions across wielders

**Status**: planned, research needed · **Owner**: TBD · **Phase**: Provider polish

## Goal

Upgrade Realmkeeper permissions from binary `allow` / `deny` letters into a provider-neutral approval surface that can represent the richer choices each LLM CLI already exposes:

- allow once
- deny once
- allow for this session
- allow this exact command / file / tool pattern
- always allow in this workspace or globally
- ask every time
- answer a provider question / elicitation
- hand off to the provider-native UI when Realmkeeper cannot own the decision

The important constraint: Realmkeeper should own a stable internal permission model, then translate to provider-specific hooks, settings, and policy files. The UI should not hard-code Claude, Codex, Cursor, or Gemini menu semantics.

## Why

Some provider prompts are not really yes/no prompts. They are "choose a scope" prompts, "allow this class of future tool calls" prompts, plan-exit prompts, MCP elicitation forms, or tool calls whose parameters can be modified before approving. Realmkeeper now supports provider-supplied permission options and typed user-input letters, but persistent rules/native "remember this" translation is still missing.

## Current state

- Shared event shape carries `permission_request` with optional `permissionMode` and `permissionOptions`.
- The renderer maps provider options into letter actions and keeps Cursor observed-session permissions as acknowledgement-only.
- Codex app-server user-input requests and typed MCP form elicitations already render as answer letters.
- IPC still resolves the current permission request as a low-level provider decision; there is no separate persisted rule-choice API yet.
- `LetterCard` already renders an arbitrary action list. The missing pieces are persistent rule semantics, provider-native "remember this" translation, rule preview, audit rows, and rule management UI.
- Cursor is intentionally observation-only in default allowlist mode.
- Gemini is currently Realmkeeper-owned: a fail-closed `BeforeTool` hook asks Realmkeeper, while a managed Gemini policy suppresses Gemini's second native prompt.

## Initial research snapshot

Sources to verify again before implementation:

- Claude Code hooks and settings:
  - https://code.claude.com/docs/en/hooks
  - https://code.claude.com/docs/en/settings
- Codex config reference:
  - https://developers.openai.com/codex/config-reference
- Cursor CLI permissions:
  - https://docs.cursor.com/cli/reference/permissions
- Gemini CLI policy engine, hooks, and settings:
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/writing-hooks.md
  - https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md

### Provider capability matrix

| Provider | Current Realmkeeper gate | Native richer choices to research | Likely Realmkeeper mapping |
|---|---|---|---|
| Claude | `PermissionRequest` bidirectional hook | `PermissionRequest.decision.updatedPermissions`, `updatedInput`, deny `message` / `interrupt`; `PreToolUse.permissionDecision` can be `allow`, `deny`, `ask`, and newer non-interactive flows support deferral for user questions | Return binary allow/deny for the current request, plus optionally send `updatedPermissions` for "remember" choices. Add a separate flow for question/elicitation prompts. |
| Codex | `PermissionRequest` bidirectional hook, same local shape as Claude in our adapter | `approval_policy` supports `untrusted`, `on-request`, `never`, and granular prompt categories; app/MCP tool approval modes support `auto`, `prompt`, `approve`; managed hooks support `PermissionRequest` in config reference | Verify exact hook output schema in the installed CLI. For persistent choices, prefer Realmkeeper local rules first; optionally write Codex config only for explicit "native remember" choices. |
| Cursor | `beforeShellExecution` advisory; Realmkeeper returns `ask` and the Cursor UI decides | CLI permission tokens in `~/.cursor/cli-config.json` or `<project>/.cursor/cli.json`: `Shell(...)`, `Read(...)`, `Write(...)`, with deny taking precedence; print mode writes require `--force` | Keep default IDE flow observational. For Realmkeeper-spawned or force/yolo sessions, map remember choices into Cursor permission tokens after explicit opt-in. |
| Gemini | `BeforeTool` bidirectional hook plus managed policy | Policy rules in `~/.gemini/policies/*.toml` support `allow`, `deny`, `ask_user`, priorities, modes, tool names, command prefixes, args regex, MCP names, subagents, and `allowRedirection`; settings expose default approval mode, permanent approval toggles, and disable-always-allow controls | Keep Realmkeeper as the real gate. Add Realmkeeper-local rules for automatic allow/deny before showing a letter. Optionally mirror "native remember" rules into a separate managed TOML file. |

## Target internal model

Add provider-neutral permission choices:

```ts
type PermissionChoiceKind =
  | "allow-once"
  | "deny-once"
  | "allow-session"
  | "allow-rule"
  | "deny-rule"
  | "ask-rule"
  | "modify-and-allow"
  | "answer"
  | "open-native";

type PermissionScope =
  | "request"
  | "session"
  | "workspace"
  | "global"
  | "provider-native";

type PermissionChoice = {
  id: string;
  label: string;
  kind: PermissionChoiceKind;
  scope: PermissionScope;
  primary?: boolean;
  dangerous?: boolean;
  rulePreview?: string;
};

type PermissionRule = {
  id: string;
  provider: "claude" | "codex" | "cursor" | "gemini";
  behavior: "allow" | "deny" | "ask";
  scope: "session" | "workspace" | "global";
  matcher: {
    toolName?: string;
    commandPrefix?: string;
    commandRegex?: string;
    pathGlob?: string;
    mcpName?: string;
    rawProviderRule?: unknown;
  };
  createdAt: number;
  expiresAt?: number;
};
```

Keep `PermissionDecision` as the low-level provider reply (`allow` / `deny`) and add a separate `PermissionChoice` layer above it. A choice may resolve the current request and also write or update a rule.

## UX shape

- Keep the fast path visible: primary buttons for `allow once` and `deny`.
- Put persistence choices in a compact menu, not a row of five equal buttons.
- Show the generated rule preview before saving a persistent rule:
  - `Allow Bash(git status:*) globally`
  - `Allow run_shell_command commandPrefix="pnpm test" in this workspace`
  - `Deny Read(.env*) globally`
- Keyboard shortcuts:
  - `A`: allow once
  - `D`: deny
  - number keys: visible extra choices, if present
  - `M`: open more choices
- If the provider prompt is actually a question or elicitation, render inputs/selects instead of permission buttons.

## Implementation phases

### Phase 1 - Research and empirical matrix

1. Capture current local versions: `claude --version`, `codex --version`, `cursor-agent --version`, `gemini --version`.
2. For each provider, record real prompt examples:
   - shell command approval
   - file edit/write approval
   - plan exit / mode change
   - MCP tool approval
   - MCP/user elicitation prompt
   - subagent invocation approval
3. For each prompt, log:
   - hook event name and stdin payload
   - native menu choices shown
   - hook stdout schema that resolves it
   - whether a persistent "always allow" choice writes a config file
   - whether an already-running session reloads that change
4. Update provider docs with the empirical results before coding.

### Phase 2 - Shared data model

1. Keep `permissionOptions` as the provider-supplied current-request option layer.
2. Add a separate `PermissionChoice` / `PermissionRuleSuggestion` layer for actions that persist beyond the current request.
3. Extend shared IPC:
   - `ResolvePermissionRequest` keeps the current low-level provider decision.
   - Add `ApplyPermissionChoiceRequest` for richer choices that may also write a Realmkeeper rule or native provider config.
4. Store pending request metadata in the bridge so a later choice can write a rule and still resolve the open socket.

### Phase 3 - Realmkeeper rule engine

1. Add `~/.realmkeeper/permissions.json` or app-state-backed storage for Realmkeeper-local rules.
2. Match rules before rendering a permission letter.
3. If a rule matches:
   - auto-resolve the hook
   - emit a visible `permission_resolved` or `permission_auto_resolved` event
   - include which rule matched for auditability
4. Keep deny precedence higher than allow.
5. Add a Connection tab section to view/remove saved rules.

### Phase 4 - Provider translators

Claude:
- Support `updatedPermissions` for explicit native persistence choices.
- Support `updatedInput` for "modify and allow" prompts.
- Research whether Realmkeeper should also handle `AskUserQuestion`, `Elicitation`, and plan exit as separate request types.

Codex:
- Verify current `PermissionRequest` output schema against local CLI and official config reference.
- Decide whether persistent choices should write Realmkeeper rules only, or also Codex config:
  - top-level `approval_policy`
  - granular `approval_policy.granular.*`
  - app/MCP `approval_mode` overrides
- Treat Desktop / VS Code version drift as a first-class test case.

Cursor:
- Keep IDE allowlist mode observation-only unless we can prove a mode where hook decisions are authoritative.
- For Realmkeeper-spawned CLI sessions, research whether `--force` or equivalent is acceptable.
- If enabled, write permission tokens to the safest scope:
  - project `<project>/.cursor/cli.json` for workspace-specific rules
  - user `~/.cursor/cli-config.json` only for explicit global choices

Gemini:
- Keep `BeforeTool` as Realmkeeper's gate.
- Add local rules for "allow once/session/rule" so Realmkeeper can answer without popping a letter.
- Split the current broad native-suppressing policy from user-generated native rules:
  - `realmkeeper-managed.toml`: suppress native prompt because Realmkeeper gates
  - `realmkeeper-rules.toml`: optional explicit native mirrors
- Support commandPrefix, argsPattern, modes, MCP, and subagent rule fields.

### Phase 5 - UI

1. Refactor permission letters to render `PermissionChoice[]`.
2. Add a compact "more" menu for persistent scopes.
3. Add rule preview modal for high-risk persistent choices.
4. Add provider-specific caveat text only when needed, for example Cursor observation-only.
5. Add audit rows in ActivityLog:
   - `allowed once`
   - `allowed by saved rule`
   - `saved rule`
   - `denied by saved rule`

### Phase 6 - Tests and manual verification

Automated:
- Unit-test rule matcher precedence.
- Unit-test provider rule generation for Claude, Gemini, Cursor, and Codex.
- IPC tests for `ApplyPermissionChoiceRequest`.

Manual:
- Run one real permission prompt per provider and verify:
  - allow once resolves current prompt
  - deny blocks current prompt
  - allow session skips the next matching prompt in the same session only
  - allow workspace persists across provider restart
  - global deny wins over workspace allow
  - provider-native file changes are made only after explicit choice

## Open questions

- Should Realmkeeper's local rules be the source of truth for all providers, with provider-native config only used to suppress duplicate prompts?
- Do we want TTL rules, like "allow this command for 15 minutes"?
- Should persistent rules live in app state, `~/.realmkeeper/permissions.json`, or per-repo `.realmkeeper/permissions.json`?
- For Claude, should we prefer `updatedPermissions` so Claude's own UI knows about the saved rule, or keep persistence in Realmkeeper to avoid config churn?
- For Cursor, which launch modes make hook decisions authoritative enough to support more than observation?
- How do we distinguish a permission prompt from an elicitation/question in the shared UI without making everything feel like a modal form?

## Non-goals

- Replacing provider security systems wholesale.
- Auto-writing global provider configs without an explicit user click.
- Making Cursor IDE allowlist approvals authoritative if Cursor still treats hook output as advisory.
- Shipping broad "always allow everything" rules as user-generated policy.

## Recommended v1

Ship a Realmkeeper-local rule engine first:

1. `allow once`
2. `deny`
3. `allow this exact command/tool for this session`
4. `allow this exact command/tool in this workspace`
5. rule management UI

Then add provider-native mirroring only for Claude and Gemini, where the upstream surfaces are documented clearly enough to make the mapping safe. Codex and Cursor should stay behind empirical verification because their desktop/extension/CLI behavior has more version drift.
