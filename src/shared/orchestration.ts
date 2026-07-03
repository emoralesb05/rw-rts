import { z } from "zod";
import {
  AgentToolSchema,
  NonNegativeIntSchema,
  NonNegativeNumberSchema,
} from "./schemas/common";

export const OrchestrationRunStatusSchema = z.enum([
  "queued",
  "running",
  "paused",
  "completed",
  "failed",
  "stopped",
]);
export type OrchestrationRunStatus = z.infer<
  typeof OrchestrationRunStatusSchema
>;

export const OrchestrationStepStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "skipped",
]);
export type OrchestrationStepStatus = z.infer<
  typeof OrchestrationStepStatusSchema
>;

export const OrchestrationEventKindSchema = z.enum([
  "created",
  "started",
  "paused",
  "resumed",
  "stopped",
  "completed",
  "failed",
  "checkpoint",
  "step_updated",
  "budget_exceeded",
  "provider_error",
  "recovered",
]);
export type OrchestrationEventKind = z.infer<
  typeof OrchestrationEventKindSchema
>;

export const RunBudgetSchema = z.object({
  maxIterations: NonNegativeIntSchema.optional(),
  maxRuntimeMs: NonNegativeNumberSchema.optional(),
  maxConsecutiveFailures: NonNegativeIntSchema.optional(),
  maxToolMs: NonNegativeNumberSchema.optional(),
});
export type RunBudget = z.infer<typeof RunBudgetSchema>;

export const OrchestrationProviderSessionSchema = z.object({
  tool: AgentToolSchema,
  sessionId: z.string().min(1),
  unitId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
});
export type OrchestrationProviderSession = z.infer<
  typeof OrchestrationProviderSessionSchema
>;

export const OrchestrationCheckpointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  createdAt: NonNegativeNumberSchema,
  stepId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
});
export type OrchestrationCheckpoint = z.infer<
  typeof OrchestrationCheckpointSchema
>;

export const OrchestrationStepSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  kind: z.string().min(1),
  status: OrchestrationStepStatusSchema,
  attempts: NonNegativeIntSchema,
  createdAt: NonNegativeNumberSchema,
  updatedAt: NonNegativeNumberSchema,
  startedAt: NonNegativeNumberSchema.optional(),
  endedAt: NonNegativeNumberSchema.optional(),
  providerSessionId: z.string().min(1).optional(),
  traceId: z.string().min(1).optional(),
  permissionRequestId: z.string().min(1).optional(),
  userInputRequestId: z.string().min(1).optional(),
  inputSummary: z.string().optional(),
  outputSummary: z.string().optional(),
  error: z.string().optional(),
});
export type OrchestrationStep = z.infer<typeof OrchestrationStepSchema>;

export const OrchestrationRunEventSchema = z.object({
  id: z.string().min(1),
  kind: OrchestrationEventKindSchema,
  at: NonNegativeNumberSchema,
  message: z.string().optional(),
  stepId: z.string().min(1).optional(),
  checkpointId: z.string().min(1).optional(),
});
export type OrchestrationRunEvent = z.infer<
  typeof OrchestrationRunEventSchema
>;

export const OrchestrationRunSchema = z.object({
  id: z.string().min(1),
  template: z.string().min(1),
  title: z.string().min(1),
  status: OrchestrationRunStatusSchema,
  cwd: z.string().min(1).optional(),
  repoRoot: z.string().min(1).optional(),
  createdAt: NonNegativeNumberSchema,
  updatedAt: NonNegativeNumberSchema,
  startedAt: NonNegativeNumberSchema.optional(),
  endedAt: NonNegativeNumberSchema.optional(),
  pauseReason: z.string().optional(),
  failureReason: z.string().optional(),
  providerSessions: z.array(OrchestrationProviderSessionSchema),
  traceIds: z.array(z.string().min(1)),
  permissionRequestIds: z.array(z.string().min(1)),
  userInputRequestIds: z.array(z.string().min(1)),
  steps: z.array(OrchestrationStepSchema),
  checkpoints: z.array(OrchestrationCheckpointSchema),
  budget: RunBudgetSchema,
  lastCheckpointId: z.string().min(1).optional(),
  events: z.array(OrchestrationRunEventSchema),
});
export type OrchestrationRun = z.infer<typeof OrchestrationRunSchema>;

export const OrchestrationStoreFileSchema = z.object({
  schemaVersion: z.literal(1),
  runs: z.record(z.string(), OrchestrationRunSchema),
});
export type OrchestrationStoreFile = z.infer<
  typeof OrchestrationStoreFileSchema
>;

export const EMPTY_ORCHESTRATION_STORE: OrchestrationStoreFile = {
  schemaVersion: 1,
  runs: {},
};
