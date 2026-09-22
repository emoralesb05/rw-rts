import type { MonitorHistory as History } from "@shared/schemas";

export function MonitorHistory({ history }: { history?: History }) {
  if (!history) return null;
  const latestGap = history.gaps.at(-1);
  return (
    <section
      aria-label="Monitoring history"
      className="border-line text-muted border-b px-5 py-2 text-xs"
    >
      {history.warning ? <p role="status">{history.warning}</p> : null}
      {latestGap ? (
        <p>
          Monitoring gap: {date(latestGap.from)} – {date(latestGap.to)}.
          Activity may be missing; this interval has not been replayed.
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer py-1">
          Last seen history · {history.entries.length}{" "}
          {history.entries.length === 1 ? "session" : "sessions"} · not live
          status
        </summary>
        <p className="py-1">
          Latest saved observation per session, up to 200 sessions for 30
          days—not a complete timeline. Current status requires fresh evidence.
          Previous blockers are unconfirmed and cannot be answered here.
        </p>
        <ul className="max-h-40 overflow-auto">
          {history.entries.map((entry) => (
            <li key={entry.agentId} className="py-1 break-all">
              {entry.providerId} · {entry.agentId} · Previously {entry.state} ·{" "}
              {date(entry.lastObservedAt)}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function date(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}
