import { Bot, Search } from "lucide-react";
import type { AgentMonitorRecord, MonitorAgentState } from "@shared/schemas";
import { cn } from "../lib/cn";
import {
  formatAge,
  providerName,
  shortPath,
  StatePill,
} from "./monitor-format";

type FleetTableProps = {
  agents: AgentMonitorRecord[];
  totalAgents: number;
  loading: boolean;
  selectedAgentId?: string;
  providerFilter: string;
  stateFilter: string;
  query: string;
  providers: string[];
  states: MonitorAgentState[];
  now: number;
  onSelectAgent(agentId: string): void;
  onProviderFilter(value: string): void;
  onStateFilter(value: string): void;
  onQuery(value: string): void;
};

export function FleetTable(props: FleetTableProps) {
  return (
    <section className="border-line flex min-w-0 flex-col border-r">
      <div className="border-line bg-surface-1/55 flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="mr-auto">
          <h1 className="text-sm font-semibold">Fleet</h1>
          <p className="text-muted mt-0.5 text-[11px]">
            Reconciled provider and activity evidence
          </p>
        </div>
        <label className="border-line bg-bg/60 flex h-8 items-center gap-2 rounded-md border px-2.5">
          <Search className="text-muted" size={13} aria-hidden />
          <input
            className="placeholder:text-muted/70 w-36 border-0 bg-transparent text-xs outline-none"
            value={props.query}
            onChange={(event) => props.onQuery(event.target.value)}
            placeholder="Filter agents"
            aria-label="Filter agents"
          />
        </label>
        <FilterSelect
          label="Provider"
          value={props.providerFilter}
          onChange={props.onProviderFilter}
          options={props.providers}
        />
        <FilterSelect
          label="State"
          value={props.stateFilter}
          onChange={props.onStateFilter}
          options={props.states}
        />
      </div>
      <div className="border-line text-muted grid grid-cols-[minmax(150px,1.25fr)_100px_minmax(160px,1fr)_86px] gap-3 border-b px-4 py-2 text-[10px] font-semibold tracking-[0.12em] uppercase">
        <span>Agent</span>
        <span>State</span>
        <span>Current activity</span>
        <span className="text-right">Observed</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {props.loading && props.totalAgents === 0 ? (
          <EmptyFleet
            title="Loading monitor…"
            body="Gathering local agent evidence."
          />
        ) : props.agents.length === 0 ? (
          <EmptyFleet
            title={
              props.totalAgents
                ? "No matching agents"
                : "No agents observed yet"
            }
            body={
              props.totalAgents
                ? "Clear a filter to widen the fleet view."
                : "Start an agent or connect provider hooks. New activity appears here automatically."
            }
          />
        ) : (
          props.agents.map((agent) => (
            <FleetRow
              key={agent.agentId}
              agent={agent}
              selected={agent.agentId === props.selectedAgentId}
              now={props.now}
              onSelect={() => props.onSelectAgent(agent.agentId)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function FleetRow({
  agent,
  selected,
  now,
  onSelect,
}: {
  agent: AgentMonitorRecord;
  selected: boolean;
  now: number;
  onSelect(): void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "border-line hover:bg-surface-2/55 grid w-full grid-cols-[minmax(150px,1.25fr)_100px_minmax(160px,1fr)_86px] items-center gap-3 border-b px-4 py-3 text-left transition-colors",
        selected && "bg-accent/[0.07] shadow-[inset_2px_0_0_#6cc6ff]"
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="border-line bg-surface-2 grid h-8 w-8 flex-none place-items-center rounded-md border">
          <Bot size={15} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">
            {agent.displayName}
          </div>
          <div className="text-muted mt-0.5 truncate text-[10px]">
            {providerName(agent.providerId)} ·{" "}
            {shortPath(agent.repoRoot ?? agent.cwd)}
          </div>
        </div>
      </div>
      <StatePill state={agent.state} />
      <div className="min-w-0">
        <div className="truncate text-[11px]">
          {agent.currentActivity ?? agent.stateReason}
        </div>
        <div className="text-muted mt-0.5 truncate text-[10px]">
          {agent.sources.join(" + ")}
        </div>
      </div>
      <div className="text-muted text-right text-[10px]">
        {formatAge(now - agent.lastObservedAt)}
        <div
          className={cn(
            "mt-0.5 capitalize",
            agent.confidence === "stale" && "text-warning"
          )}
        >
          {agent.confidence}
        </div>
      </div>
    </button>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  options: readonly string[];
}) {
  return (
    <label className="border-line bg-bg/60 flex h-8 items-center rounded-md border px-2">
      <span className="sr-only">{label}</span>
      <select
        className="text-muted bg-transparent text-[11px] outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="all">All {label.toLowerCase()}s</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {providerName(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyFleet({ title, body }: { title: string; body: string }) {
  return (
    <div className="grid h-full min-h-72 place-items-center px-6 text-center">
      <div>
        <Bot className="text-muted mx-auto mb-3" size={24} aria-hidden />
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-muted mx-auto mt-1 max-w-sm text-xs leading-5">
          {body}
        </p>
      </div>
    </div>
  );
}
