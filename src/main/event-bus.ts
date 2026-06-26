import { EventEmitter } from "node:events";
import type { AgentEvent } from "@shared/events";
import { AgentEventSchema } from "@shared/schemas";
import { resolveRepoRoot } from "./repo-root";

class EventBus extends EventEmitter {
  private recentRealmkeeperPrompts = new Map<string, number>();

  emitAgentEvent(event: AgentEvent) {
    if (this.isDuplicatePromptEcho(event)) return;
    // Stamp the repo root once here so every adapter (claude, cursor, codex,
    // hook, fixture) gets it for free without repeating the resolver call.
    if (!event.repoRoot) event.repoRoot = resolveRepoRoot(event.cwd);
    const parsed = AgentEventSchema.safeParse(event);
    if (!parsed.success) {
      console.warn(
        "[realmkeeper] dropped invalid AgentEvent",
        parsed.error.issues
      );
      return;
    }
    this.emit("event", parsed.data as AgentEvent);
  }

  private isDuplicatePromptEcho(event: AgentEvent): boolean {
    if (event.kind !== "user_prompt") return false;
    const text =
      typeof event.payload.text === "string" ? event.payload.text.trim() : "";
    if (!text) return false;
    const key = `${event.sessionId}\0${text}`;
    const now = Date.now();
    for (const [k, t] of this.recentRealmkeeperPrompts) {
      if (now - t > 30_000) this.recentRealmkeeperPrompts.delete(k);
    }
    if (event.source === "realmkeeper") {
      this.recentRealmkeeperPrompts.set(key, now);
      return false;
    }
    return (
      event.source === "hook" &&
      now - (this.recentRealmkeeperPrompts.get(key) ?? 0) <= 30_000
    );
  }

  onAgentEvent(listener: (event: AgentEvent) => void) {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const bus = new EventBus();
