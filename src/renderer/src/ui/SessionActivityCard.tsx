import { useEffect, useState } from "react";
import type { UnitState } from "@shared/events";
import { sessionActivity } from "../game/session-activity";
import { participantsForRun } from "../game/run-sites";
import { useStore } from "../store";
import { usePanels } from "./floating/panel-store";
import { inspectRealmAgent } from "./inspect-realm-agent";

export function SessionActivityCard({ unit }: { unit: UnitState }) {
  const letters = useStore((s) => s.letters);
  const units = useStore((s) => s.units);
  const runs = useStore((s) => s.orchestrationRuns);
  const district = useStore((s) => s.worlds[unit.worldId]);
  const focusAlerts = usePanels((s) => s.focusAlerts);
  const openPanel = usePanels((s) => s.openPanel);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const activity = sessionActivity(unit, letters, now);
  const linkedRuns = Object.values(runs).filter(
    (run) => participantsForRun(run, { [unit.id]: unit }).length > 0
  );
  const parent = Object.values(units).find(
    (u) => u.sessionId === activity.parentSessionId
  );
  return (
    <section
      aria-label="Session activity site"
      className="m-3 rounded-md border border-white/10 bg-indigo-950/30 p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Session activity</h3>
        <span style={{ color: activity.color }}>
          {activity.symbol} {activity.label}
        </span>
      </div>
      <p className="text-muted mt-2 leading-relaxed">{activity.detail}</p>
      <p className="text-muted mt-2 break-all">
        District: {district?.label ?? unit.worldId}
      </p>
      <button
        type="button"
        className="mt-2 block text-sky-200"
        onClick={() => inspectRealmAgent(unit.id, true)}
      >
        Focus agent in Realm →
      </button>
      <p className="text-muted mt-1 font-mono text-[10px]">
        Session {unit.sessionId.slice(0, 12)} · last signal{" "}
        {Math.max(0, Math.floor((now - unit.lastActivity) / 1000))}s ago
      </p>
      {activity.state === "blocked" && (
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("rw:expand-hud", { detail: { title: "Alerts" } })
            );
            focusAlerts();
          }}
          className="mt-2 rounded border border-amber-300/30 px-2 py-1 text-amber-200"
        >
          Review blocking ask
        </button>
      )}
      {parent && (
        <button
          type="button"
          className="mt-2 block text-sky-200"
          onClick={() => inspectRealmAgent(parent.id, true)}
        >
          Supporting {parent.displayName} →
        </button>
      )}
      {linkedRuns.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-2">
          <p className="text-muted mb-1">Explicit runs</p>
          {linkedRuns.map((run) => (
            <button
              key={run.id}
              type="button"
              className="mt-1 block text-left text-sky-200"
              onClick={() =>
                openPanel({
                  kind: "run",
                  key: run.id,
                  title: `Run · ${run.title}`,
                  width: 560,
                })
              }
            >
              {run.title} →
            </button>
          ))}
        </div>
      )}
      {linkedRuns.length === 0 && (
        <p className="text-muted mt-2">
          No explicitly linked run. Showing session activity only.
        </p>
      )}
      {!parent && activity.parentSessionId && (
        <p className="text-muted mt-2">
          Parent session {activity.parentSessionId.slice(0, 12)} is not
          currently visible.
        </p>
      )}
    </section>
  );
}
