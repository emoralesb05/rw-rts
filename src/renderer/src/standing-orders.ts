/**
 * Standing Order loop runner — Phase 2B item #14b.
 *
 * Active orders fire their prompt at intervalMs cadence via window.kh.sendPrompt.
 * Each tick records ok/fail in the store; the store auto-flips status to
 * "exhausted" after maxIterations or "failed" after 3 consecutive failures.
 *
 * Per Q37 (vision.md): max 24 iterations default, stop after 3 in-a-row
 * failures, no cost cap. Failure = sendPrompt rejected (network/IPC error)
 * — tool-result-level failure isn't visible from this layer.
 *
 * Not persisted — orders end on app restart. Persistence comes later.
 */

import { useStore } from "./store";

const timers = new Map<string, ReturnType<typeof setInterval>>();

export function attachStandingOrderRunner(): () => void {
  const tick = async (orderId: string) => {
    const order = useStore.getState().standingOrders[orderId];
    if (!order || order.status !== "active") return;
    const unit = useStore.getState().units[order.unitId];
    if (!unit || !unit.spawnedHere || unit.status === "fallen" || unit.status === "complete") {
      // Wielder is gone or in a state where commands won't land — halt.
      useStore.getState().haltStandingOrder(orderId);
      return;
    }
    try {
      await window.kh.sendPrompt({
        unitId: order.unitId,
        prompt: `[Standing Order — iteration ${order.iterationsRun + 1}/${order.maxIterations}]\n\n${order.prompt}`,
      });
      useStore.getState().recordOrderTick(orderId, true);
    } catch {
      useStore.getState().recordOrderTick(orderId, false);
    }
  };

  const ensureTimers = () => {
    const orders = useStore.getState().standingOrders;
    // Clear timers for orders that are no longer active.
    for (const [id, t] of timers) {
      const order = orders[id];
      if (!order || order.status !== "active") {
        clearInterval(t);
        timers.delete(id);
      }
    }
    // Start timers for newly-active orders.
    for (const [id, order] of Object.entries(orders)) {
      if (order.status !== "active" || timers.has(id)) continue;
      // Fire once immediately so the user sees movement, then on interval.
      void tick(id);
      const t = setInterval(() => void tick(id), order.intervalMs);
      timers.set(id, t);
    }
  };

  const unsub = useStore.subscribe(() => ensureTimers());
  ensureTimers();

  return () => {
    unsub();
    for (const t of timers.values()) clearInterval(t);
    timers.clear();
  };
}
