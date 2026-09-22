import { useMemo, useRef } from "react";
import type { AgentMonitorRecord } from "@shared/schemas";
import { useStore } from "../store";
import { ConversationStream } from "../ui/ConversationStream";
import { LetterCard } from "../ui/hud/LetterCard";
import { eventMatchesAgent } from "./agent-conversation";
import { InspectorControls } from "./InspectorControls";

export function AgentConversation({ agent }: { agent: AgentMonitorRecord }) {
  const requestsRef = useRef<HTMLDivElement>(null);
  const events = useStore((state) => state.events);
  const letters = useStore((state) => state.letters);
  const units = useStore((state) => state.units);
  const pending = useMemo(
    () =>
      letters.filter(
        (letter) =>
          letter.sessionId &&
          units[letter.sessionId]?.tool === agent.providerId &&
          letter.actions.some(
            ({ action }) =>
              "requestId" in action &&
              events.some(
                (event) =>
                  eventMatchesAgent(event, agent) &&
                  event.sessionId === letter.sessionId &&
                  event.payload.requestId === action.requestId
              )
          )
      ),
    [agent, events, letters, units]
  );
  return (
    <section
      aria-label="Agent conversation"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="border-line text-muted border-b px-4 py-2 text-[11px]">
        Recent captured activity only—not a complete provider transcript.
        Missing replies do not mean the agent stopped.
        <details className="mt-2">
          <summary className="cursor-pointer">
            Model and approval settings
          </summary>
          <p className="mt-2">
            Model: {agent.model ?? "Not reported"}. Model switching is not wired
            yet.
          </p>
          <p className="mt-1">
            Effective approval policy: not reported. Saved Realmkeeper rules may
            answer matching requests; this is not a global auto-approve mode.
          </p>
          <p className="mt-1">
            {agent.tool === "cursor"
              ? "Cursor approvals remain in the provider UI."
              : "Use a pending request’s explicit choices to approve once or save a scoped rule."}
          </p>
        </details>
      </div>
      {pending.length ? (
        <div
          aria-label="Pending agent requests"
          ref={requestsRef}
          className="border-line max-h-60 shrink-0 space-y-2 overflow-y-auto border-b p-3"
        >
          {pending.map((letter) => (
            <LetterCard key={letter.id} letter={letter} />
          ))}
        </div>
      ) : null}
      <ConversationStream
        agent={agent}
        cap={80}
        onRequestFocus={(id) => {
          const card = Array.from(
            requestsRef.current?.querySelectorAll<HTMLElement>(
              "[data-letter-request-id]"
            ) ?? []
          ).find((element) => element.dataset.letterRequestId === id);
          card?.scrollIntoView({ block: "nearest" });
          card?.querySelector<HTMLButtonElement>("button")?.focus();
        }}
      />
      <div className="border-line max-h-[40%] shrink-0 overflow-auto border-t p-3">
        <InspectorControls agent={agent} compact />
      </div>
    </section>
  );
}
