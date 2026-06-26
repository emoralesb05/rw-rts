/**
 * Codex active adapter.
 *
 * Realmkeeper now drives Codex through `codex app-server --stdio`, which gives
 * us a long-lived JSON-RPC thread and `turn/steer` for prompts that arrive while
 * a turn is already active.
 *
 * `normalizeCodexStreamMessage` remains here for legacy `codex exec --json`
 * stream fixtures and transcript-format coverage.
 */

import {
  resumeCodexAppServerSession,
  spawnCodexAppServerAgent,
} from "./codex-app-server";
import type { AgentEvent, AgentEventSource } from "@shared/events";
import type { ChildProcess } from "node:child_process";
import type { ProviderStreamMessage } from "@shared/schemas";

export type SpawnCodexOptions = {
  prompt: string;
  cwd: string;
};

export type SpawnedCodexAgent = {
  unitId: string;
  sessionId: string;
  cwd: string;
  proc: ChildProcess;
  send(prompt: string): void;
  kill(): void;
};

const agents = new Map<string, SpawnedCodexAgent>();

export function listCodexAgents(): SpawnedCodexAgent[] {
  return [...agents.values()];
}

export function getCodexAgent(unitId: string): SpawnedCodexAgent | undefined {
  return agents.get(unitId);
}

export function resumeCodexSession(opts: {
  sessionId: string;
  cwd: string;
  prompt: string;
}): ChildProcess {
  return resumeCodexAppServerSession(opts);
}

export async function spawnCodexAgent(
  opts: SpawnCodexOptions
): Promise<SpawnedCodexAgent> {
  const agent = await spawnCodexAppServerAgent(opts);
  agents.set(agent.unitId, agent);
  agent.proc.on("exit", () => agents.delete(agent.unitId));
  return agent;
}

export function normalizeCodexStreamMessage(
  msg: ProviderStreamMessage,
  sessionId: string,
  cwd: string,
  source: AgentEventSource = "spawned"
): AgentEvent[] {
  const ts = Date.now();
  const base = {
    sessionId,
    tool: "codex" as const,
    cwd,
    source,
  };
  const out: AgentEvent[] = [];

  if (msg.type === "item.completed") {
    const item = (msg as { item?: Record<string, unknown> }).item ?? {};
    const itemType = String(item.type ?? "");
    if (itemType === "agent_message" && typeof item.text === "string") {
      out.push({
        ...base,
        timestamp: ts,
        kind: "assistant_text",
        payload: { text: item.text },
      });
    } else if (itemType === "command_execution") {
      const cmd = String(item.command ?? "");
      const result = item.aggregated_output ?? item.output ?? item.exit_code;
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: { name: "Bash", input: { command: cmd } },
      });
      if (result !== undefined) {
        out.push({
          ...base,
          timestamp: ts + 1,
          kind: "tool_result",
          payload: { output: result },
        });
      }
    } else if (itemType === "file_change") {
      const path = String(item.path ?? item.file_path ?? "");
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: {
          name: "Edit",
          input: { file_path: path, change: item.change },
        },
      });
    }
    // 'reasoning' items skipped — they're verbose and not user-facing
  }
  return out;
}
