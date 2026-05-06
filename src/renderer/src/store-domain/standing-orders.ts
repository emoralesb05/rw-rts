import type { PersistedStandingOrder, UnitState } from "@shared/events";
import { unitIdentityFor, unitIdentityForUnit } from "../unit-identity";

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
