# Probes — Agent Observability Control Plane

| Probe | Question | Finding | Needs infra |
|---|---|---|---|
| [`otel-collector-validation-2026-07-03.mjs`](./otel-collector-validation-2026-07-03.mjs) / [`otel-collector-validation-2026-07-03.md`](./otel-collector-validation-2026-07-03.md) | Does Realmkeeper's generated OTel-shaped JSON get accepted by a real OpenTelemetry Collector OTLP HTTP receiver? | L2 — accepted with HTTP 200; 1 trace / 3 spans. | Docker plus the pinned Collector image digest. |
