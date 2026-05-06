import { z } from "zod";
import {
  AgentToolSchema,
  NonNegativeIntSchema,
  NonNegativeNumberSchema,
} from "./common";

export const WielderStatsSchema = z.object({
  tool: AgentToolSchema,
  repoRoot: z.string(),
  visits: NonNegativeIntSchema,
  seals: NonNegativeIntSchema,
  falls: NonNegativeIntSchema,
  totalMunny: NonNegativeNumberSchema,
  lastSeen: NonNegativeNumberSchema,
});
export type WielderStats = z.infer<typeof WielderStatsSchema>;

export const WorldStatsSchema = z.object({
  repoRoot: z.string(),
  lastVisit: NonNegativeNumberSchema,
  totalSeals: NonNegativeIntSchema,
  totalClears: NonNegativeIntSchema,
  totalFalls: NonNegativeIntSchema,
  sealedAt: NonNegativeNumberSchema.optional(),
});
export type WorldStats = z.infer<typeof WorldStatsSchema>;

export const PersistedStandingOrderSchema = z.object({
  id: z.string(),
  unitIdentity: z.string(),
  prompt: z.string(),
  intervalMs: NonNegativeNumberSchema,
  maxIterations: NonNegativeIntSchema,
  iterationsRun: NonNegativeIntSchema,
  startedAt: NonNegativeNumberSchema,
});
export type PersistedStandingOrder = z.infer<
  typeof PersistedStandingOrderSchema
>;

export const PersistedStateSchema = z.object({
  schemaVersion: z.literal(2),
  kingdomFoundedAt: NonNegativeNumberSchema,
  totalMunnyEver: NonNegativeNumberSchema,
  wielders: z.record(z.string(), WielderStatsSchema),
  worlds: z.record(z.string(), WorldStatsSchema),
  standingOrders: z.array(PersistedStandingOrderSchema),
});
export type PersistedState = z.infer<typeof PersistedStateSchema>;
