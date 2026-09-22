import { useStore } from "../../store";
import { participantsForRun, runSiteReadout } from "../../game/run-sites";
import { usePanels } from "./panel-store";

export function RunSitePanelBody({ runId }: { runId: string }) {
  const run = useStore((s) => s.orchestrationRuns[runId]);
  const unavailable = useStore((s) => s.orchestrationRunsMissing);
  const units = useStore((s) => s.units);
  const openPanel = usePanels((s) => s.openPanel);
  if (!run) return <p className="p-4">This run is no longer available.</p>;
  const readout = runSiteReadout(run, unavailable);
  const participants = participantsForRun(run, units);
  return (
    <section
      aria-label="Run worksite inspector"
      className="space-y-4 p-4 text-sm"
    >
      <header>
        <p className="text-muted text-xs">
          Explicit orchestration run · {run.template}
        </p>
        <h3 className="mt-1 font-semibold">{run.title}</h3>
        <p style={{ color: readout.color }}>{readout.status}</p>
      </header>
      {unavailable && (
        <p role="status">
          Run source unavailable. Showing the last recorded details, not live
          status.
        </p>
      )}
      <p className="text-muted text-xs break-all">
        {run.repoRoot ?? run.cwd ?? "No repository recorded"}
      </p>
      <p>
        {readout.completedSteps} of {readout.totalSteps} recorded steps
        completed. This is not an estimate of overall task progress.
      </p>
      {run.pauseReason && <p>Pause reason: {run.pauseReason}</p>}
      {run.failureReason && <p>Failure reason: {run.failureReason}</p>}
      <div>
        <h4 className="mb-2 font-semibold">Linked sessions</h4>
        {participants.length ? (
          participants.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className="mr-2 mb-2 rounded border border-white/15 px-2 py-1 text-sky-200"
              onClick={() =>
                openPanel({
                  kind: "wielder",
                  key: unit.id,
                  title: `${unit.displayName} · ${unit.tool}`,
                  width: 560,
                })
              }
            >
              {unit.displayName} · {unit.tool}
            </button>
          ))
        ) : (
          <p className="text-muted">
            No linked session is currently visible. Sharing a repository does
            not imply participation.
          </p>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto">
        <h4 className="mb-2 font-semibold">Recorded steps</h4>
        {run.steps.length ? (
          <ol className="space-y-2">
            {run.steps.map((step) => (
              <li key={step.id} className="rounded border border-white/10 p-2">
                <span className="font-medium">{step.title}</span>
                <span className="text-muted ml-2 text-xs">{step.status}</span>
                {step.error && (
                  <p className="mt-1 text-xs text-red-200">{step.error}</p>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">No steps recorded yet.</p>
        )}
      </div>
      <p className="text-muted text-xs">
        {run.checkpoints.length} checkpoints · updated{" "}
        {new Date(run.updatedAt).toLocaleString()}
      </p>
      <button
        type="button"
        className="rounded border border-white/20 px-3 py-2"
        onClick={() =>
          openPanel({
            kind: "kingdom",
            title: "Kingdom",
            width: 780,
            data: { initialTab: "runs" },
          })
        }
      >
        Open Run board controls
      </button>
    </section>
  );
}
