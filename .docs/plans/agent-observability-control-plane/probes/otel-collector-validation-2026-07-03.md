# Probe: OTel Collector Validation

## Question

Does Realmkeeper's `exportTracesToOtel(projectTraces(...))` output get accepted
by a real OpenTelemetry Collector OTLP HTTP receiver?

## Setup

- Date: 2026-07-03.
- Runtime: `bun .docs/plans/agent-observability-control-plane/probes/otel-collector-validation-2026-07-03.mjs`.
- Collector image:
  `otel/opentelemetry-collector-contrib@sha256:4935caa35e9a4cb387e35732e8fb22b2b5759af8d12e7043357f03837f6e8df5`.
- The script starts a temporary Collector container with an OTLP HTTP receiver
  and debug exporter, posts a redacted Realmkeeper trace export to
  `/v1/traces`, checks the debug logs, and removes the container.

## Result

```json
{
  "ok": true,
  "image": "otel/opentelemetry-collector-contrib@sha256:4935caa35e9a4cb387e35732e8fb22b2b5759af8d12e7043357f03837f6e8df5",
  "status": 200,
  "traceCount": 1,
  "spanCount": 3,
  "endpoint": "http://127.0.0.1:64701/v1/traces"
}
```

## Finding

L2 — measured: the Dockerized OpenTelemetry Collector accepted Realmkeeper's
OTLP/HTTP JSON trace export with HTTP 200 and emitted debug logs for the probe
service.

This validates receiver-level compatibility for Realmkeeper's current
OTel-shaped JSON. It does not prove strict GenAI semantic-convention stability,
vendor-specific dashboard behavior, or OTLP/gRPC export.
