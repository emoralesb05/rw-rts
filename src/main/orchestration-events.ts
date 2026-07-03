import type { AgentEvent, AgentTool } from "@shared/events";
import { AgentToolSchema } from "@shared/schemas/common";
import type {
  OrchestrationRun,
  OrchestrationRunEvent,
} from "@shared/orchestration";

function recordParam(run: OrchestrationRun, key: string): unknown {
  return run.params?.[key];
}

function stringParam(run: OrchestrationRun, key: string): string | undefined {
  const value = recordParam(run, key);
  return typeof value === "string" && value ? value : undefined;
}

function toolParam(run: OrchestrationRun): AgentTool | undefined {
  const parsed = AgentToolSchema.safeParse(recordParam(run, "tool"));
  if (parsed.success) return parsed.data;
  return run.providerSessions[0]?.tool;
}

export function agentEventForOrchestrationRun(
  run: OrchestrationRun,
  event: OrchestrationRunEvent
): AgentEvent | null {
  const providerSession = run.providerSessions[0];
  const sessionId = stringParam(run, "sessionId") ?? providerSession?.sessionId;
  const tool = toolParam(run);
  const cwd = run.cwd ?? stringParam(run, "cwd") ?? providerSession?.cwd;

  if (!sessionId || !tool || !cwd) return null;

  return {
    sessionId,
    tool,
    cwd,
    repoRoot: run.repoRoot,
    timestamp: event.at,
    kind: "orchestration_event",
    payload: {
      orchestrationRunId: run.id,
      orchestrationRunTitle: run.title,
      orchestrationRunStatus: run.status,
      orchestrationTemplate: run.template,
      orchestrationEventKind: event.kind,
      text: event.message,
      stepId: event.stepId,
      checkpointId: event.checkpointId,
    },
    source: "realmkeeper",
  };
}
