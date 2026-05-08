import { EventEmitter } from "node:events";
import type { AgentEvent } from "@shared/events";
import { AgentEventSchema } from "@shared/schemas";
import { resolveRepoRoot } from "./repo-root";

class EventBus extends EventEmitter {
  emitAgentEvent(event: AgentEvent) {
    // Stamp the repo root once here so every adapter (claude, cursor, codex,
    // hook, fixture) gets it for free without repeating the resolver call.
    if (!event.repoRoot) event.repoRoot = resolveRepoRoot(event.cwd);
    const parsed = AgentEventSchema.safeParse(event);
    if (!parsed.success) {
      console.warn(
        "[keykeeper] dropped invalid AgentEvent",
        parsed.error.issues
      );
      return;
    }
    this.emit("event", parsed.data as AgentEvent);
  }
  onAgentEvent(listener: (event: AgentEvent) => void) {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const bus = new EventBus();
