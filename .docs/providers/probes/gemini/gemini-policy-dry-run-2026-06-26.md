# Probe: Gemini policy/settings dry run

**Date:** 2026-06-26
**Scope:** Installed Gemini CLI policy/settings behavior relevant to Realmkeeper's fail-closed `BeforeTool` gate.

## Commands

```bash
gemini --version
gemini --help
sed -n '2060,2084p' /usr/local/lib/node_modules/@google/gemini-cli/bundle/docs/reference/configuration.md
sed -n '1,140p' /usr/local/lib/node_modules/@google/gemini-cli/bundle/docs/reference/policy-engine.md
sed -n '229,320p' /usr/local/lib/node_modules/@google/gemini-cli/bundle/docs/reference/policy-engine.md
GEMINI_CLI_HOME=/private/tmp/rw-gemini-policy-smoke-home gemini --prompt "Reply with exactly gemini-policy-smoke and do not use tools." --output-format stream-json --approval-mode plan --skip-trust
```

## Findings

- Installed CLI remained `0.47.0`.
- Local help still exposes `--policy`, `--admin-policy`, `--approval-mode default|auto_edit|yolo|plan`, `--sandbox`, and `--skip-trust`.
- Local bundled docs state `hooksConfig.enabled` is the canonical hooks-system toggle and that disabled hooks are not executed.
- Local bundled policy docs confirm user/admin TOML policies, `allow`/`deny`/`ask_user` decisions, priorities, `commandPrefix`, `argsPattern`, `modes`, and that workspace `.gemini/policies` are currently disabled.
- A narrow marker-only check showed Realmkeeper's Gemini hook entries and managed policy marker are installed on this machine, without printing user config contents.
- An isolated `GEMINI_CLI_HOME` smoke with hooks disabled did not have non-interactive auth configured. Retrying with the same non-secret auth mode attempted browser login, so the live model/policy turn was stopped and the stuck Gemini processes were killed.
- Static dry-run finding: a settings file can contain Realmkeeper hook entries and the managed policy while `hooksConfig.enabled: false` disables hook execution. Realmkeeper must treat that state as not gated.

## Implementation Result

- `isGeminiInstalled()` now returns false when `hooksConfig.enabled === false`.
- The Gemini adapter's launch gate now returns false when `hooksConfig.enabled === false`, so spawned Gemini falls back from `--approval-mode yolo` to `default`.
- Focused tests cover both installer status and adapter launch-gate behavior with a mocked home directory.

## Coverage Gap

This probe did not execute a model-selected shell command through an isolated Gemini policy file because the isolated config would require browser OAuth. A future live policy execution probe should use a throwaway API key, Vertex/GCA env, or an explicitly authenticated temporary `GEMINI_CLI_HOME`.
