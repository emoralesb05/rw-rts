import type { ReactNode } from "react";
import { Bot, CircleDot } from "lucide-react";
import type { AgentMonitorRecord } from "@shared/schemas";
import { cn } from "../lib/cn";
import { formatAge, providerName, StatePill } from "./monitor-format";
import { InspectorControls } from "./InspectorControls";

export function Inspector({
  agent,
  now,
}: {
  agent?: AgentMonitorRecord;
  now: number;
}) {
  if (!agent) {
    return (
      <aside className="bg-surface-1/20 grid min-h-0 place-items-center p-6 text-center">
        <div>
          <CircleDot
            className="text-muted mx-auto mb-3"
            size={22}
            aria-hidden
          />
          <div className="text-sm font-semibold">Select an agent</div>
          <p className="text-muted mt-1 text-xs">
            Evidence and controls appear here.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="bg-surface-1/20 flex min-h-0 flex-col">
      <div className="border-line border-b p-4">
        <div className="flex items-start gap-3">
          <div className="border-line bg-surface-2 grid h-10 w-10 place-items-center rounded-md border">
            <Bot size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">
              {agent.displayName}
            </h2>
            <div className="text-muted mt-1 flex items-center gap-2 text-[10px]">
              <span>{providerName(agent.providerId)}</span>
              <span>·</span>
              <span>{formatAge(now - agent.lastObservedAt)}</span>
            </div>
          </div>
          <StatePill state={agent.state} />
        </div>
        <p className="mt-3 text-xs leading-5">{agent.stateReason}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <InspectorSection title="Context">
          <Definition
            label="Repository"
            value={agent.repoRoot ?? agent.cwd ?? "Unknown"}
            mono
          />
          <Definition label="Branch" value={agent.branch ?? "Not reported"} />
          <Definition
            label="Session"
            value={agent.nativeSessionId ?? "Not reported"}
            mono
          />
          <Definition
            label="Authority"
            value={`${agent.authority} · ${agent.confidence}`}
          />
          <Definition
            label="Usage"
            value={
              agent.usage.coverage === "unavailable"
                ? "Not reported"
                : `${agent.usage.totalTokens ?? "Unknown"} tokens · ${agent.usage.coverage}`
            }
          />
        </InspectorSection>

        <InspectorSection title="Evidence">
          <div className="space-y-2">
            {agent.evidence.map((item, index) => (
              <div
                key={item.observationId}
                className="border-line bg-bg/35 rounded-md border p-2.5"
              >
                <div className="flex items-center gap-2 text-[10px]">
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      index === 0 ? "bg-accent" : "bg-muted"
                    )}
                  />
                  <span className="font-semibold">{item.sourceId}</span>
                  <span className="text-muted ml-auto">
                    {formatAge(now - item.observedAt)}
                  </span>
                </div>
                <div className="text-muted mt-1.5 text-[11px] leading-4">
                  <span className="text-text capitalize">{item.state}</span> ·{" "}
                  {item.stateReason ?? "No reason"}
                </div>
              </div>
            ))}
          </div>
        </InspectorSection>

        <InspectorSection title="Controls">
          <InspectorControls key={agent.agentId} agent={agent} />
        </InspectorSection>
      </div>
    </aside>
  );
}

function InspectorSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border-line mb-4 border-b pb-4 last:border-0">
      <h3 className="text-muted mb-2 text-[10px] font-semibold tracking-[0.13em] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Definition({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex gap-3 py-1 text-[11px]">
      <dt className="text-muted w-20 flex-none">{label}</dt>
      <dd
        className={cn(
          "min-w-0 flex-1 text-right break-all",
          mono && "font-mono text-[10px]"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
