/** Discoverable controls and truthful meanings, without a permanent tutorial overlay. */
export function RealmGuide() {
  return (
    <details className="relative text-[11px] text-slate-200">
      <summary className="cursor-pointer list-none rounded px-3 py-1 font-semibold hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-sky-200">
        Realm guide
      </summary>
      <section
        aria-label="Realm controls and meanings"
        className="absolute top-9 right-0 w-72 rounded-lg border border-indigo-300/25 bg-[#14152c] p-4 text-left shadow-2xl"
      >
        <h2 className="text-sm font-semibold text-amber-100">
          Watch your realm
        </h2>
        <p className="mt-2 leading-relaxed text-slate-300">
          Drag the landscape to explore. Scroll to zoom toward your pointer.
          Recenter realm returns to the wide view.
        </p>
        <dl className="mt-3 space-y-3 leading-relaxed">
          <div>
            <dt className="font-semibold text-sky-200">Worlds → projects</dt>
            <dd className="text-slate-300">
              Click a courtyard or its name for project commands. The minimap
              helps you navigate.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-sky-200">
              Characters → agent sessions
            </dt>
            <dd className="text-slate-300">
              Click an agent or its workstation to inspect. Hover a workstation
              to reveal its activity.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-sky-200">
              Workstations → observed activity
            </dt>
            <dd className="text-slate-300">
              Books, benches, and instruments show session activity—not task
              progress. RUN markers represent explicitly recorded runs.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-amber-200">
              Needs you → unresolved request
            </dt>
            <dd className="text-slate-300">
              Next ask finds these agents. Review the request in Alerts;
              navigating or clicking a character never approves it.
            </dd>
          </div>
        </dl>
      </section>
    </details>
  );
}
