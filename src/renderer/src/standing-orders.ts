import {
  defaultBudgetForTemplate,
  STANDING_ORDER_TEMPLATE_ID,
} from "@shared/orchestration-templates";
import { useStore } from "./store";

const migrating = new Set<string>();

export function attachStandingOrderMigrator(): () => void {
  const migrate = async (orderId: string) => {
    const state = useStore.getState();
    const order = state.standingOrders[orderId];
    if (!order || order.status !== "active" || !order.unitId) return;
    if (migrating.has(orderId)) return;
    const unit = state.units[order.unitId];
    if (!unit) return;

    migrating.add(orderId);
    try {
      const remainingIterations = Math.max(
        1,
        order.maxIterations - order.iterationsRun
      );
      const run = await window.rw.createOrchestrationRun({
        template: STANDING_ORDER_TEMPLATE_ID,
        title: `Standing Order · ${unit.displayName}`,
        status: "running",
        cwd: unit.cwd,
        repoRoot: unit.repoRoot,
        params: {
          unitId: unit.id,
          sessionId: unit.sessionId,
          tool: unit.tool,
          cwd: unit.cwd,
          status: unit.status,
          prompt: order.prompt,
          intervalMs: order.intervalMs,
          migratedStandingOrderId: order.id,
        },
        budget: {
          ...defaultBudgetForTemplate(STANDING_ORDER_TEMPLATE_ID),
          maxIterations: remainingIterations,
        },
      });
      useStore.getState().upsertOrchestrationRun(run);
      useStore.getState().haltStandingOrder(orderId);
    } finally {
      migrating.delete(orderId);
    }
  };

  const ensureMigrations = () => {
    const orders = useStore.getState().standingOrders;
    for (const [id, order] of Object.entries(orders)) {
      if (order.status === "active" && order.unitId) void migrate(id);
    }
  };

  const unsub = useStore.subscribe(() => ensureMigrations());
  ensureMigrations();

  return () => {
    unsub();
    migrating.clear();
  };
}
