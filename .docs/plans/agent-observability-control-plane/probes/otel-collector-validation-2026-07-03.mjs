import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { exportTracesToOtel } from "../../../../src/shared/trace-export.ts";
import { projectTraces } from "../../../../src/shared/traces.ts";

const execFileAsync = promisify(execFile);
const IMAGE =
  process.env.OTEL_COLLECTOR_IMAGE ??
  "otel/opentelemetry-collector-contrib@sha256:4935caa35e9a4cb387e35732e8fb22b2b5759af8d12e7043357f03837f6e8df5";

function event(timestamp, kind, payload = {}) {
  return {
    sessionId: "otel-probe-claude",
    tool: "claude",
    cwd: "/repo",
    repoRoot: "/repo",
    timestamp,
    kind,
    payload,
    source: "realmkeeper",
  };
}

function buildPayload() {
  const traces = projectTraces([
    event(1_000, "session_start", { text: "otel collector probe" }),
    event(2_000, "user_prompt", { text: "run a redacted probe" }),
    event(3_000, "tool_use", {
      name: "Bash",
      input: { command: "printf ok" },
    }),
    event(4_000, "tool_result", {
      name: "Bash",
      output: { stdout: "ok" },
    }),
    event(5_000, "session_end", {
      text: "done",
      output: {
        input_tokens: 120,
        output_tokens: 30,
        total_cost_usd: 0.0042,
      },
    }),
  ]);
  return {
    traces,
    payload: exportTracesToOtel(traces, {
      serviceName: "realmkeeper-otel-probe",
      serviceVersion: "probe-2026-07-03",
    }),
  };
}

async function docker(args) {
  const { stdout, stderr } = await execFileAsync("docker", args, {
    maxBuffer: 1024 * 1024 * 8,
  });
  return `${stdout}${stderr}`.trim();
}

async function retry(fn, attempts = 30) {
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw lastError;
}

async function main() {
  const tempDir = mkdtempSync(join(tmpdir(), "realmkeeper-otel-probe-"));
  const container = `realmkeeper-otel-probe-${process.pid}`;
  const configPath = join(tempDir, "collector.yaml");
  writeFileSync(
    configPath,
    [
      "receivers:",
      "  otlp:",
      "    protocols:",
      "      http:",
      "        endpoint: 0.0.0.0:4318",
      "exporters:",
      "  debug:",
      "    verbosity: detailed",
      "service:",
      "  pipelines:",
      "    traces:",
      "      receivers: [otlp]",
      "      exporters: [debug]",
      "",
    ].join("\n")
  );

  try {
    await docker([
      "run",
      "--rm",
      "-d",
      "--name",
      container,
      "-p",
      "127.0.0.1::4318",
      "-v",
      `${configPath}:/etc/otelcol-contrib/config.yaml:ro`,
      IMAGE,
      "--config=/etc/otelcol-contrib/config.yaml",
    ]);

    const portText = await retry(() => docker(["port", container, "4318/tcp"]));
    const port = portText.match(/127\.0\.0\.1:(\d+)/)?.[1];
    if (!port) throw new Error(`could not determine collector port: ${portText}`);

    const { traces, payload } = buildPayload();
    const response = await retry(async () => {
      const res = await fetch(`http://127.0.0.1:${port}/v1/traces`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`collector returned ${res.status}: ${await res.text()}`);
      }
      return res;
    });

    await retry(async () => {
      const logs = await docker(["logs", container]);
      if (!logs.includes("realmkeeper-otel-probe")) {
        throw new Error("collector debug logs did not include service name");
      }
      return logs;
    });

    const spanCount = traces.reduce((sum, trace) => sum + trace.spans.length, 0);
    console.log(
      JSON.stringify(
        {
          ok: true,
          image: IMAGE,
          status: response.status,
          traceCount: traces.length,
          spanCount,
          endpoint: `http://127.0.0.1:${port}/v1/traces`,
        },
        null,
        2
      )
    );
  } finally {
    await docker(["rm", "-f", container]).catch(() => {});
    rmSync(tempDir, { recursive: true, force: true });
  }
}

await main();
