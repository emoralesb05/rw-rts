import type {
  AgentEvent,
  Letter,
  LetterAction,
  LetterRisk,
  PersistedStandingOrder,
  UnitState,
  WorldAlertLevel,
  WorldState,
} from "@shared/events";
import type { ResolvePermissionRequest } from "@shared/schemas";
import { unitIdentityFor, unitIdentityForUnit } from "./unit-identity";

export type StandingOrder = {
  id: string;
  unitId: string;
  unitIdentity: string;
  prompt: string;
  intervalMs: number;
  maxIterations: number;
  iterationsRun: number;
  failuresInRow: number;
  status: "active" | "halted" | "exhausted" | "failed";
  startedAt: number;
  lastFiredAt: number;
};

export function ordersToPersisted(
  orders: Record<string, StandingOrder>
): PersistedStandingOrder[] {
  return Object.values(orders)
    .filter((o) => o.status === "active")
    .map((o) => ({
      id: o.id,
      unitIdentity: o.unitIdentity,
      prompt: o.prompt,
      intervalMs: o.intervalMs,
      maxIterations: o.maxIterations,
      iterationsRun: o.iterationsRun,
      startedAt: o.startedAt,
    }));
}

export function createStandingOrder(params: {
  id: string;
  unitId: string;
  unit?: Pick<UnitState, "tool" | "cwd" | "repoRoot">;
  prompt: string;
  intervalMs: number;
  maxIterations: number;
  now: number;
}): StandingOrder {
  return {
    id: params.id,
    unitId: params.unitId,
    unitIdentity: params.unit
      ? unitIdentityForUnit(params.unit)
      : `unknown::${params.unitId}`,
    prompt: params.prompt,
    intervalMs: params.intervalMs,
    maxIterations: params.maxIterations,
    iterationsRun: 0,
    failuresInRow: 0,
    status: "active",
    startedAt: params.now,
    lastFiredAt: 0,
  };
}

export function recordStandingOrderTick(
  order: StandingOrder,
  ok: boolean,
  now: number
): StandingOrder {
  const iterationsRun = order.iterationsRun + 1;
  const failuresInRow = ok ? 0 : order.failuresInRow + 1;
  let status: StandingOrder["status"] = "active";
  if (failuresInRow >= 3) status = "failed";
  else if (iterationsRun >= order.maxIterations) status = "exhausted";
  return {
    ...order,
    iterationsRun,
    failuresInRow,
    status,
    lastFiredAt: now,
  };
}

export function recordStandingOrderTickById(
  orders: Record<string, StandingOrder>,
  orderId: string,
  ok: boolean,
  now: number
): Record<string, StandingOrder> | null {
  const cur = orders[orderId];
  if (!cur || cur.status !== "active") return null;
  return {
    ...orders,
    [orderId]: recordStandingOrderTick(cur, ok, now),
  };
}

export function haltStandingOrderById(
  orders: Record<string, StandingOrder>,
  orderId: string
): Record<string, StandingOrder> | null {
  const cur = orders[orderId];
  if (!cur) return null;
  return {
    ...orders,
    [orderId]: { ...cur, status: "halted" },
  };
}

export function hydrateStandingOrders(
  persistedOrders: readonly PersistedStandingOrder[]
): Record<string, StandingOrder> {
  const standingOrders: Record<string, StandingOrder> = {};
  for (const p of persistedOrders) {
    if (p.iterationsRun >= p.maxIterations) continue;
    standingOrders[p.id] = {
      id: p.id,
      unitId: "",
      unitIdentity: p.unitIdentity,
      prompt: p.prompt,
      intervalMs: p.intervalMs,
      maxIterations: p.maxIterations,
      iterationsRun: p.iterationsRun,
      failuresInRow: 0,
      status: "active",
      startedAt: p.startedAt,
      lastFiredAt: 0,
    };
  }
  return standingOrders;
}

export function bindStandingOrdersForUnit(
  orders: Record<string, StandingOrder>,
  unit: Pick<UnitState, "id" | "tool" | "cwd" | "repoRoot">
): Record<string, StandingOrder> {
  const identity = unitIdentityFor(unit.tool, unit.repoRoot ?? unit.cwd);
  let next = orders;
  for (const order of Object.values(orders)) {
    if (
      !order.unitId &&
      order.unitIdentity === identity &&
      order.status === "active"
    ) {
      next = { ...next, [order.id]: { ...order, unitId: unit.id } };
    }
  }
  return next;
}

export function worldIdForEvent(event: AgentEvent): string {
  const base = event.repoRoot ?? event.cwd;
  return base.replace(/[^a-zA-Z0-9]+/g, "_") || "root";
}

export function worldLabelForEvent(event: AgentEvent): string {
  const base = event.repoRoot ?? event.cwd;
  const parts = base.split("/").filter(Boolean);
  return parts[parts.length - 1] || base;
}

export function worldPathForEvent(event: AgentEvent): string {
  return event.repoRoot ?? event.cwd;
}

export function computeAlertLevel(
  world: WorldState,
  units: Record<string, UnitState>
): WorldAlertLevel {
  const live = world.unitIds
    .map((id) => units[id])
    .filter((u): u is UnitState => !!u && u.status !== "fallen");
  const everyDone =
    world.unitIds.length > 0 &&
    world.unitIds.every((id) => {
      const u = units[id];
      return u && (u.status === "complete" || u.status === "fallen");
    });
  const heartlessCount = world.heartless.length;
  if (everyDone && heartlessCount === 0) return "cleared";
  if (live.length === 0) return "idle";
  const minHp = Math.min(...live.map((u) => u.hp));
  if (heartlessCount > 5 || minHp < 30) return "danger";
  if (heartlessCount > 0 || minHp < 70) return "warning";
  if (live.some((u) => u.status === "working" || u.status === "casting")) {
    return "active";
  }
  return "idle";
}

const TOOL_MP_BASE: Record<string, number> = {
  Read: 2,
  Glob: 2,
  Grep: 2,
  TodoWrite: 1,
  Bash: 6,
  BashOutput: 4,
  Edit: 5,
  MultiEdit: 7,
  Write: 5,
  NotebookEdit: 5,
  Task: 12,
  Agent: 12,
  WebFetch: 6,
  WebSearch: 6,
};

export function mpCostForToolUse(toolName: string): number {
  return TOOL_MP_BASE[toolName] ?? 4;
}

export function mpCostForToolResult(output: unknown): number {
  let len = 0;
  if (typeof output === "string") len = output.length;
  else if (output && typeof output === "object") {
    const r = output as Record<string, unknown>;
    if (typeof r.stdout === "string") len = r.stdout.length;
    else if (typeof r.text === "string") len = r.text.length;
    else if (typeof r.content === "string") len = r.content.length;
  }
  if (len < 1000) return 0;
  return Math.min(8, Math.floor(len / 5000));
}

export function summarizePermissionInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const r = input as Record<string, unknown>;
  if (typeof r.command === "string") return r.command.slice(0, 200);
  if (typeof r.file_path === "string") return r.file_path;
  if (typeof r.path === "string") return r.path;
  if (typeof r.url === "string") return r.url.slice(0, 200);
  if (typeof r.pattern === "string") return r.pattern;
  return "";
}

export function isObservationOnlyPermission(event: AgentEvent): boolean {
  return event.tool === "cursor";
}

export function classifyPermissionRisk(
  toolName: string,
  input: unknown
): LetterRisk {
  const tool = toolName.toLowerCase();
  const r = (input as Record<string, unknown>) || {};
  if (
    tool === "read" ||
    tool === "glob" ||
    tool === "grep" ||
    tool === "webfetch" ||
    tool === "websearch"
  ) {
    return "low";
  }
  if (tool === "bash") {
    const cmd = String(r.command ?? "").toLowerCase();
    if (
      /\bsudo\b/.test(cmd) ||
      /\bchmod\b.+(?:777|-r)/.test(cmd) ||
      /\bchown\b/.test(cmd) ||
      /\brm\b.+\b-(?:rf|fr|Rf)\b/.test(cmd) ||
      /\bdd\b\s+if=/.test(cmd) ||
      /\bmkfs\b/.test(cmd) ||
      /\bgit\s+push\s+(?:--force|-f)\b/.test(cmd) ||
      /\bgit\s+reset\s+--hard\b/.test(cmd)
    ) {
      return "high";
    }
    return "elevated";
  }
  if (tool === "write" || tool === "edit" || tool === "multiedit") {
    const path = String(r.file_path ?? r.path ?? "");
    if (
      path.startsWith("/etc/") ||
      path.startsWith("/usr/") ||
      path.startsWith("/System/") ||
      path.startsWith("/var/") ||
      /\.(ssh|aws|gnupg)\//.test(path) ||
      /\.(bash_profile|zshrc|zprofile|netrc)$/.test(path)
    ) {
      return "high";
    }
    return "elevated";
  }
  return "elevated";
}

export function extractRecentReasoning(
  events: readonly AgentEvent[],
  sessionId: string
): string {
  for (const ev of events) {
    if (ev.sessionId !== sessionId) continue;
    if (ev.kind !== "assistant_text") continue;
    const text = String(ev.payload.text ?? "").trim();
    if (!text) continue;
    return text.length > 480 ? text.slice(0, 480) + "…" : text;
  }
  return "";
}

export function argKeyForToolInput(input: unknown): string {
  if (!input || typeof input !== "object") return "*";
  const r = input as Record<string, unknown>;
  if (typeof r.file_path === "string") return `file:${r.file_path}`;
  if (typeof r.path === "string") return `file:${r.path}`;
  if (typeof r.command === "string") return `cmd:${r.command.slice(0, 80)}`;
  if (typeof r.pattern === "string") return `glob:${r.pattern}`;
  if (typeof r.url === "string") return `url:${r.url.slice(0, 80)}`;
  return "*";
}

export function isPermissionLetter(letter: Letter): boolean {
  return letter.actions.some(
    (a) =>
      a.action.kind === "permission-allow" ||
      a.action.kind === "permission-deny"
  );
}

export function dismissInformationalLetters(letters: readonly Letter[]): Letter[] {
  return letters.filter((l) => isPermissionLetter(l));
}

export function permissionResolutionForAction(
  action: LetterAction
): ResolvePermissionRequest | null {
  switch (action.kind) {
    case "permission-allow":
      return { requestId: action.requestId, decision: "allow" };
    case "permission-deny":
      return {
        requestId: action.requestId,
        decision: "deny",
        message: action.message,
      };
    default:
      return null;
  }
}
