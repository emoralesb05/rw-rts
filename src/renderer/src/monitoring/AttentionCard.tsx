import { useState } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import type {
  MonitorAttentionItem,
  UpdateAttentionRequest,
} from "@shared/schemas";
import { cn } from "../lib/cn";
import { formatAge } from "./monitor-format";

export function AttentionCard({
  item,
  selectedAgentId,
  onSelectAgent,
  now,
}: {
  item: MonitorAttentionItem;
  selectedAgentId?: string;
  onSelectAgent(agentId: string): void;
  now: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function update(action: UpdateAttentionRequest["action"]) {
    if (!item.occurrenceId || pending) return;
    setPending(true);
    setError(undefined);
    try {
      await window.rw.updateAttention({
        attentionId: item.attentionId,
        occurrenceId: item.occurrenceId,
        action,
      });
    } catch {
      setError(
        "Could not update notification. Refresh and try again; the request was not answered."
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <article
      aria-label={item.title}
      className={cn(
        "border-line bg-surface-2/75 rounded-md border p-3",
        item.agentId &&
          item.agentId === selectedAgentId &&
          "border-accent/70 bg-accent/[0.07]"
      )}
    >
      <button
        type="button"
        disabled={!item.agentId}
        onClick={() => item.agentId && onSelectAgent(item.agentId)}
        className="w-full text-left"
      >
        <div className="flex items-start gap-2">
          {item.severity === "critical" ? (
            <ShieldAlert className="text-danger mt-0.5" size={14} aria-hidden />
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
      {item.lifecycle !== "open" ? (
        <p className="text-muted mt-2 text-[11px]">
          {item.lifecycle === "snoozed"
            ? `Snoozed until ${new Date(item.snoozedUntil ?? now).toLocaleTimeString()}`
            : "Acknowledged · still unresolved"}
        </p>
      ) : null}
      {item.occurrenceId ? (
        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
          {item.lifecycle === "open" ? (
            <button
              disabled={pending}
              onClick={() => void update("acknowledge")}
              className="text-accent rounded border px-2 py-1"
            >
              Acknowledge
            </button>
          ) : (
            <button
              disabled={pending}
              onClick={() => void update("reopen")}
              className="text-accent rounded border px-2 py-1"
            >
              Reopen
            </button>
          )}
          {item.lifecycle !== "snoozed" ? (
            <button
              disabled={pending}
              onClick={() => void update("snooze")}
              className="text-muted rounded border px-2 py-1"
            >
              Snooze 15m
            </button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger mt-2 text-[11px]">
          {error}
        </p>
      ) : null}
    </article>
  );
}
