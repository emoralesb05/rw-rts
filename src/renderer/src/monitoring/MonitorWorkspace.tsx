import { useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import type { MonitorAgentState } from "@shared/schemas";
import { Button } from "../ui/components/kit/Button";
import { AttentionRail } from "./AttentionRail";
import { FleetTable } from "./FleetTable";
import { Inspector } from "./Inspector";
import { useNow } from "./monitor-format";
import { useMonitorSnapshot } from "./use-monitor-snapshot";

type MonitorWorkspaceProps = {
  onOpenRealm(): void;
};

const STATE_ORDER: MonitorAgentState[] = [
  "blocked",
  "failed",
  "ready",
  "working",
  "idle",
  "unknown",
  "offline",
  "done",
];

export function MonitorWorkspace({ onOpenRealm }: MonitorWorkspaceProps) {
  const { snapshot, loading, error, refresh } = useMonitorSnapshot();
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [providerFilter, setProviderFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [query, setQuery] = useState("");
  const now = useNow();

  const providers = useMemo(
    () => [...new Set(snapshot.agents.map((agent) => agent.providerId))].sort(),
    [snapshot.agents]
  );
  const agents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.agents.filter(
      (agent) =>
        (providerFilter === "all" || agent.providerId === providerFilter) &&
        (stateFilter === "all" || agent.state === stateFilter) &&
        (!needle ||
          [
            agent.displayName,
            agent.cwd,
            agent.repoRoot,
            agent.branch,
            agent.currentActivity,
          ].some((value) => value?.toLowerCase().includes(needle)))
    );
  }, [providerFilter, query, snapshot.agents, stateFilter]);

  useEffect(() => {
    if (
      selectedAgentId &&
      snapshot.agents.some((agent) => agent.agentId === selectedAgentId)
    ) {
      return;
    }
    setSelectedAgentId(snapshot.agents[0]?.agentId);
  }, [selectedAgentId, snapshot.agents]);

  const selected = snapshot.agents.find(
    (agent) => agent.agentId === selectedAgentId
  );
  const healthyCount = snapshot.integrations.filter(
    (integration) => integration.status === "healthy"
  ).length;

  return (
    <div className="bg-bg text-text flex h-screen min-h-0 flex-col overflow-hidden">
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[200] h-8 [-webkit-app-region:drag]" />
      <header className="border-line bg-surface-1/95 flex h-14 flex-none items-center gap-4 border-b px-5 pt-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="border-accent/35 bg-accent/10 text-accent grid h-8 w-8 place-items-center rounded-md border">
            <Activity size={17} aria-hidden />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">
              Realmkeeper
            </div>
            <div className="text-muted text-[10px] font-semibold tracking-[0.18em] uppercase">
              Agent monitor
            </div>
          </div>
        </div>
        <div className="border-line bg-bg/60 ml-auto flex items-center rounded-md border p-0.5 [-webkit-app-region:no-drag]">
          <button
            className="bg-accent text-bg rounded px-3 py-1.5 text-[11px] font-semibold"
            type="button"
          >
            Monitor
          </button>
          <button
            className="text-muted hover:text-text rounded px-3 py-1.5 text-[11px] font-semibold"
            type="button"
            onClick={onOpenRealm}
          >
            Realm
          </button>
        </div>
        <div className="text-muted flex items-center gap-2 text-[11px]">
          <span className="bg-success h-1.5 w-1.5 rounded-full shadow-[0_0_8px_rgba(122,240,192,0.7)]" />
          {snapshot.agents.length} agents · {healthyCount}/
          {snapshot.integrations.length} sources
        </div>
        <Button
          variant="ghost"
          className="h-7 min-h-0 px-2"
          aria-label="Refresh monitor"
          onClick={() => void refresh()}
        >
          <RefreshCw size={13} aria-hidden />
        </Button>
      </header>

      {error ? (
        <div className="border-danger/40 bg-danger/10 text-danger border-b px-5 py-2 text-xs">
          Monitor connection failed: {error}
        </div>
      ) : null}

      <main className="grid min-h-0 flex-1 grid-cols-[280px_minmax(420px,1fr)_360px]">
        <AttentionRail
          items={snapshot.attention}
          integrations={snapshot.integrations}
          selectedAgentId={selectedAgentId}
          onSelectAgent={setSelectedAgentId}
          now={now}
        />
        <FleetTable
          agents={agents}
          totalAgents={snapshot.agents.length}
          loading={loading}
          selectedAgentId={selectedAgentId}
          providerFilter={providerFilter}
          stateFilter={stateFilter}
          query={query}
          providers={providers}
          states={STATE_ORDER}
          now={now}
          onSelectAgent={setSelectedAgentId}
          onProviderFilter={setProviderFilter}
          onStateFilter={setStateFilter}
          onQuery={setQuery}
        />
        <Inspector agent={selected} now={now} />
      </main>
    </div>
  );
}
