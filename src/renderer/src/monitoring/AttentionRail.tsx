import type {
  MonitorAttentionItem,
  MonitorIntegrationHealth,
} from "@shared/schemas";
import { cn } from "../lib/cn";
import { AttentionCard } from "./AttentionCard";

type AttentionRailProps = {
  items: MonitorAttentionItem[];
  integrations: MonitorIntegrationHealth[];
  selectedAgentId?: string;
  onSelectAgent(agentId: string): void;
  now: number;
};

export function AttentionRail({
  items,
  integrations,
  selectedAgentId,
  onSelectAgent,
  now,
}: AttentionRailProps) {
  const awake = items.filter((item) => item.lifecycle !== "snoozed");
  const snoozed = items.filter((item) => item.lifecycle === "snoozed");
  return (
    <aside className="border-line bg-surface-1/35 flex min-h-0 flex-col border-r">
      <div className="border-line border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Attention</h2>
          <span className="bg-danger/15 text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">
            {items.filter((item) => item.lifecycle === "open").length} new
          </span>
        </div>
        <p className="text-muted mt-1 text-[11px]">
          Notification choices never answer requests or unblock agents.
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {awake.length === 0 ? (
          <div className="border-line bg-bg/35 text-muted rounded-md border border-dashed px-3 py-5 text-center text-xs">
            {snoozed.length
              ? "All current notifications are snoozed. Blockers remain unresolved."
              : "Nothing needs you right now."}
          </div>
        ) : (
          awake.map((item) => (
            <AttentionCard
              key={item.occurrenceId ?? item.attentionId}
              item={item}
              selectedAgentId={selectedAgentId}
              onSelectAgent={onSelectAgent}
              now={now}
            />
          ))
        )}
        {snoozed.length ? (
          <details>
            <summary className="text-muted cursor-pointer py-2 text-xs">
              Snoozed ({snoozed.length})
            </summary>
            <div className="space-y-2">
              {snoozed.map((item) => (
                <AttentionCard
                  key={item.occurrenceId ?? item.attentionId}
                  item={item}
                  selectedAgentId={selectedAgentId}
                  onSelectAgent={onSelectAgent}
                  now={now}
                />
              ))}
            </div>
          </details>
        ) : null}
      </div>
      <div className="border-line border-t p-3">
        <div className="text-muted mb-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
          Integrations
        </div>
        <div className="space-y-1.5">
          {integrations.map((integration) => (
            <div
              key={integration.sourceId}
              className="flex items-center gap-2 text-[11px]"
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  integration.status === "healthy" && "bg-success",
                  integration.status === "degraded" && "bg-warning",
                  integration.status === "unavailable" && "bg-muted"
                )}
              />
              <span className="min-w-0 flex-1 truncate">
                {integration.label}
              </span>
              <span className="text-muted capitalize">
                {integration.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
