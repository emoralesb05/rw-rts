# Probes — Agent Observability Control Plane

No install is required. Probes 01–02 use Node and probes 03–04 use the
repository's Bun runtime. Each probe is read-only; probe 02 requires access to
the running local Herdr socket and probe 04 requires local provider transcripts.

| Probe | Question | Finding | Mode | Needs infra |
|---|---|---|---|---|
| [`01-current-monitoring-surface.mjs`](./01-current-monitoring-surface.mjs) | What can the shipped monitor see and retain? | H6, H7 | live source inspection | no |
| [`02-live-herdr-feasibility.mjs`](./02-live-herdr-feasibility.mjs) | Can Herdr provide read-only identity and lifecycle state without pane content? | H8 | live local integration | running Herdr server |
| [`03-trace-snapshot-amplification.mjs`](./03-trace-snapshot-amplification.mjs) | Is whole-trace-per-event JSONL suitable for monitoring history? | H9 | synthetic | no |
| [`04-real-transcript-amplification.mjs`](./04-real-transcript-amplification.mjs) | Does amplification persist on real local provider transcript shapes? | H9 | live local data, aggregate-only | local Claude/Codex transcripts |
| [`otel-collector-validation-2026-07-03.mjs`](./otel-collector-validation-2026-07-03.mjs) / [`otel-collector-validation-2026-07-03.md`](./otel-collector-validation-2026-07-03.md) | Does Realmkeeper's generated OTel-shaped JSON get accepted by a real OpenTelemetry Collector OTLP HTTP receiver? | H5 | live collector | Docker plus pinned image |
