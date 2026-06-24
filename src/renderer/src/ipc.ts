import { useStore } from "./store";
import { play, type SoundName } from "./audio/sounds";
import type { AgentEvent } from "@shared/events";

function soundFor(ev: AgentEvent): SoundName | null {
  if (ev.kind === "session_start") return "session_start";
  if (ev.kind === "session_end") return "session_end";
  if (ev.kind === "error") return "error";
  if (ev.kind === "permission_request" || ev.kind === "user_prompt") {
    return "letter";
  }
  if (ev.kind === "subagent_spawn") return "summon";
  if (ev.kind === "tool_use") {
    const name = String(ev.payload.name ?? "");
    if (["Edit", "Write", "MultiEdit"].includes(name)) return "edit";
    if (name === "Bash") return "bash";
    if (name === "WebFetch" || name === "WebSearch") return "web";
    if (name === "Task" || name === "Agent") return "summon";
    return "tool";
  }
  return null;
}

export function attachEventStream() {
  return window.rw.onEvent((event) => {
    useStore.getState().ingest(event);
    window.dispatchEvent(new CustomEvent("rw:event", { detail: event }));
    const s = soundFor(event);
    if (s) play(s);
  });
}

export const rw = window.rw;
