# Gemini CLI hardening probes

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [gemini-policy-dry-run-2026-06-26.md](gemini-policy-dry-run-2026-06-26.md) | Do Gemini policy/settings surfaces support Realmkeeper's fail-closed gate assumptions? | `hooksConfig.enabled: false` disables hooks, so Realmkeeper must fall back from `yolo` when hooks are globally disabled. | A non-interactive Gemini auth credential for a live policy execution probe |
| [gemini-auth-status-2026-06-29.md](gemini-auth-status-2026-06-29.md) | Can this machine run a non-interactive Gemini live policy probe? | No: `gemini --list-sessions` reached auth but failed with `IneligibleTierError` / `UNSUPPORTED_CLIENT`, and no API key, Vertex env, `gcloud`, or ADC config is present. | Supported Gemini CLI auth: API key, Vertex/GCA env, or supported account tier |
