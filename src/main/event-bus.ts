import { EventEmitter } from "node:events";
import type { AgentEvent } from "@shared/events";

class EventBus extends EventEmitter {
  emitAgentEvent(event: AgentEvent) {
    this.emit("event", event);
  }
  onAgentEvent(listener: (event: AgentEvent) => void) {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const bus = new EventBus();
