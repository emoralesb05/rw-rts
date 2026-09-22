import { AlertTriangle, ShieldAlert } from "lucide-react";
import type {
  MonitorAttentionItem,
  MonitorIntegrationHealth,
} from "@shared/schemas";
import { cn } from "../lib/cn";
import { formatAge } from "./monitor-format";

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
  return (
    <aside className="border-line bg-surface-1/35 flex min-h-0 flex-col border-r">
      <div className="border-line border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Attention</h2>
          <span className="bg-danger/15 text-danger rounded-full px-2 py-0.5 text-[10px] font-bold">
            {items.length}
          </span>
        </div>
        <p className="text-muted mt-1 text-[11px]">
          Human decisions and unhealthy sources
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="border-line bg-bg/35 text-muted rounded-md border border-dashed px-3 py-5 text-center text-xs">
            Nothing needs you right now.
          </div>
        ) : (
          items.map((item) => (
            <button
              key={item.attentionId}
              type="button"
              disabled={!item.agentId}
              onClick={() => item.agentId && onSelectAgent(item.agentId)}
              className={cn(
                "border-line bg-surface-2/75 hover:border-accent/55 w-full rounded-md border p-3 text-left transition-colors",
                item.agentId === selectedAgentId &&
                  "border-accent/70 bg-accent/[0.07]",
                !item.agentId && "cursor-default"
              )}
            >
              <div className="flex items-start gap-2">
                {item.severity === "critical" ? (
                  <ShieldAlert
                    className="text-danger mt-0.5"
                    size={14}
                    aria-hidden
                  />
                ) : (
                  <AlertTriangle
                    className="text-warning mt-0.5"
                    size={14}
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">{item.title}</div>
                  <div className="text-muted mt-1 line-clamp-3 text-[11px] leading-4">
                    {item.summary}
                  </div>
                  <div className="text-muted/70 mt-2 text-[10px]">
                    {formatAge(now - item.updatedAt)}
                  </div>
                </div>
              </div>
            </button>
          ))
        )}
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
