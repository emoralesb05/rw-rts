import { execFileSync } from "node:child_process";
import { listCodexAppServerProviderSessions } from "./adapters/codex-app-server";
import type {
  AgentTool,
  ListProviderSessionsRequest,
  ListProviderSessionsResponse,
  ProviderSessionEntry,
  ProviderSessionListError,
} from "@shared/schemas";

const DEFAULT_TOOLS: AgentTool[] = ["claude", "codex", "cursor", "gemini"];

export async function listProviderSessions(
  req: ListProviderSessionsRequest = {}
): Promise<ListProviderSessionsResponse> {
  const tools = req?.tools?.length ? req.tools : DEFAULT_TOOLS;
  const sessions: ProviderSessionEntry[] = [];
  const errors: ProviderSessionListError[] = [];

  for (const tool of tools) {
    try {
      if (tool === "claude") {
        sessions.push(...listClaudeProviderSessions());
      } else if (tool === "codex") {
        sessions.push(
          ...(await listCodexAppServerProviderSessions({ cwd: req?.cwd }))
        );
      } else {
        errors.push({
          tool,
          reasonCode: "not_implemented",
          message: `${providerName(tool)} provider-session discovery is not wired yet.`,
        });
      }
    } catch (err) {
      errors.push({
        tool,
        reasonCode: "provider_error",
        message: errorMessage(err),
      });
    }
  }

  return {
    generatedAt: Date.now(),
    sessions: sessions.sort(providerSessionSort),
    errors,
  };
}

export function listClaudeProviderSessions(): ProviderSessionEntry[] {
  const output = execFileSync("claude", ["agents", "--json", "--all"], {
    encoding: "utf8",
    timeout: 8_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return normalizeClaudeProviderSessions(JSON.parse(output));
}

export function normalizeClaudeProviderSessions(
  value: unknown
): ProviderSessionEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const session = record(entry);
    const sessionId = stringValue(session?.sessionId);
    if (!session || !sessionId) return [];
    const status = claudeSessionStatus(session.status);
    const kind = stringValue(session.kind);
    const providerManaged = kind === "background";
    return [
      compact({
        providerSessionId: sessionId,
        tool: "claude",
        displayName: stringValue(session.name) ?? sessionId,
        cwd: stringValue(session.cwd),
        status,
        source: kind,
        createdAt: numberValue(session.startedAt),
        pid: numberValue(session.pid),
        availableActions: providerManaged
          ? ["resume", "attach", "logs", "stop", "respawn"]
          : ["resume", "attach", "logs"],
      }) as ProviderSessionEntry,
    ];
  });
}

function claudeSessionStatus(value: unknown): ProviderSessionEntry["status"] {
  const status = stringValue(value);
  if (status === "idle") return "idle";
  if (status === "busy") return "busy";
  if (status === "complete" || status === "completed") return "complete";
  if (status === "failed" || status === "error") return "failed";
  return "unknown";
}

function providerSessionSort(
  a: ProviderSessionEntry,
  b: ProviderSessionEntry
): number {
  return (
    (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0) ||
    a.tool.localeCompare(b.tool) ||
    a.displayName.localeCompare(b.displayName)
  );
}

function providerName(tool: AgentTool): string {
  switch (tool) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "gemini":
      return "Gemini";
  }
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(err);
}
