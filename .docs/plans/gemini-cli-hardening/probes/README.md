# Gemini CLI hardening probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [gemini-policy-dry-run-2026-06-26.md](gemini-policy-dry-run-2026-06-26.md) | Do Gemini policy/settings surfaces support Realmkeeper's fail-closed gate assumptions? | `hooksConfig.enabled: false` disables hooks, so Realmkeeper must fall back from `yolo` when hooks are globally disabled. | A non-interactive Gemini auth credential for a live policy execution probe |
