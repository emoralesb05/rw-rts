import { useEffect, useState } from "react";
import type { MonitorAgentState } from "@shared/schemas";
import { cn } from "../lib/cn";

export function StatePill({ state }: { state: MonitorAgentState }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold capitalize",
        state === "working" && "border-accent/40 bg-accent/10 text-accent",
        state === "blocked" && "border-warning/50 bg-warning/10 text-warning",
        state === "failed" && "border-danger/50 bg-danger/10 text-danger",
        state === "ready" && "border-success/50 bg-success/10 text-success",
        state === "idle" && "border-line bg-surface-2 text-text",
        (state === "unknown" || state === "offline") &&
          "border-line text-muted bg-bg/50",
        state === "done" &&
          "border-success/25 bg-success/[0.06] text-success/80"
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {state}
    </span>
  );
}

export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function formatAge(ageMs: number): string {
  if (ageMs < 5_000) return "just now";
  if (ageMs < 60_000) return `${Math.max(1, Math.floor(ageMs / 1_000))}s ago`;
  if (ageMs < 60 * 60_000) return `${Math.floor(ageMs / 60_000)}m ago`;
  if (ageMs < 24 * 60 * 60_000)
    return `${Math.floor(ageMs / (60 * 60_000))}h ago`;
  return `${Math.floor(ageMs / (24 * 60 * 60_000))}d ago`;
}

export function providerName(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function shortPath(path?: string): string {
  if (!path) return "repository unknown";
  const parts = path.split("/").filter(Boolean);
  return parts.at(-1) ?? path;
}

export function sessionStatus(state: MonitorAgentState) {
  if (state === "working") return "working" as const;
  if (state === "done" || state === "ready") return "complete" as const;
  if (state === "failed") return "fallen" as const;
  return "idle" as const;
}
