# Probe: Codex app-server live approval round trip

**Date:** 2026-06-26
**Scope:** Live `codex app-server --stdio` session using the installed local Codex CLI.

## Commands

```bash
codex app-server generate-json-schema --experimental --out /private/tmp/rw-codex-live-schema-20260626-1
node .docs/providers/probes/codex/codex-app-server-live-probe-2026-06-26.mjs
```

## Result

- Installed CLI remained `codex-cli 0.142.2`.
- Schema generation confirmed `approvalPolicy: "untrusted" | "on-failure" | "on-request" | "never"` and command approval response shape `{ "decision": "accept" | "decline" | ... }`.
- The live probe started an ephemeral app-server thread with `approvalPolicy: "untrusted"` and `sandbox: "read-only"`.
- Codex emitted exactly one `item/commandExecution/requestApproval` request.
- The requested command was `/bin/zsh -c 'printf realmkeeper-live-probe'`.
- The probe responded with `{ "decision": "accept" }` only because the command matched the allow-listed harmless probe command.
- The command completed with exit code `0` and output `realmkeeper-live-probe`.
- No file-change, permission-profile, MCP elicitation, user-input, or dynamic-tool requests were emitted.
- No app-server stderr remained after filtering the sandbox-only PATH alias warning.

## Conclusion

Realmkeeper's current app-server command approval response shape matches the live Codex CLI protocol. No implementation patch was needed from this probe.
