import { useStore } from "../../store";
import { runsForWorld, runSiteReadout } from "../../game/run-sites";
import { usePanels } from "../floating/panel-store";

export function DistrictRunSites({ worldId }: { worldId: string }) {
  const runs = useStore((s) => s.orchestrationRuns);
  const worlds = useStore((s) => s.worlds);
  const units = useStore((s) => s.units);
  const missing = useStore((s) => s.orchestrationRunsMissing);
  const openPanel = usePanels((s) => s.openPanel);
  const sites = runsForWorld(worldId, runs, worlds, units);
  return (
    <section
      aria-label="District run worksites"
      className="border-t border-white/10 pt-2"
    >
      <h3 className="text-muted mb-1 text-[10px] uppercase">
        Run worksites · {sites.length}
      </h3>
      {missing && (
        <p className="text-xs text-amber-200">Run source unavailable</p>
      )}
      {sites.length ? (
        <div className="max-h-28 space-y-1 overflow-y-auto">
          {sites.map((run) => (
            <button
              key={run.id}
              type="button"
              className="flex w-full items-center justify-between gap-2 rounded bg-black/20 px-2 py-1 text-left text-xs"
              onClick={() =>
                openPanel({
                  kind: "run",
                  key: run.id,
                  title: `Run · ${run.title}`,
                  width: 560,
                })
              }
            >
              <span className="truncate">{run.title}</span>
              <span style={{ color: runSiteReadout(run, missing).color }}>
                {runSiteReadout(run, missing).status}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-muted text-xs">
          No explicit runs linked. Agent markers show session activity only.
        </p>
      )}
      {sites.length > 3 && (
        <p className="text-muted mt-1 text-[10px]">
          Map shows up to 3 sites, active work first; all {sites.length} are
          available here.
        </p>
      )}
    </section>
  );
}
