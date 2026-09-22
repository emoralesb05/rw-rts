import { z } from "zod";
import { AgentToolSchema } from "./common";

export const MonitorSourceKindSchema = z.enum([
  "realmkeeper-event",
  "provider-inventory",
  "herdr",
  "trace-usage",
]);
export type MonitorSourceKind = z.infer<typeof MonitorSourceKindSchema>;

export const MonitorAuthoritySchema = z.enum([
  "heuristic",
  "authoritative",
  "provider",
  "blocking",
]);
export type MonitorAuthority = z.infer<typeof MonitorAuthoritySchema>;

export const MonitorConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
  "stale",
]);
export type MonitorConfidence = z.infer<typeof MonitorConfidenceSchema>;

export const MonitorAgentStateSchema = z.enum([
  "working",
  "blocked",
  "ready",
  "idle",
  "done",
  "failed",
  "unknown",
  "offline",
]);
export type MonitorAgentState = z.infer<typeof MonitorAgentStateSchema>;

export const MonitorAttentionKindSchema = z.enum([
  "permission",
  "question",
  "stuck",
  "failure",
  "ready",
  "disconnected",
  "budget",
  "integration",
]);
export type MonitorAttentionKind = z.infer<typeof MonitorAttentionKindSchema>;

export const MonitorUsageCoverageSchema = z.enum([
  "reported",
  "derived",
  "unavailable",
]);
export type MonitorUsageCoverage = z.infer<typeof MonitorUsageCoverageSchema>;

export const MonitorUsageSchema = z.object({
  coverage: MonitorUsageCoverageSchema,
  sourceId: z.string().min(1).optional(),
  inputTokens: z.number().finite().nonnegative().optional(),
  outputTokens: z.number().finite().nonnegative().optional(),
  totalTokens: z.number().finite().nonnegative().optional(),
  costUsd: z.number().finite().nonnegative().optional(),
});
export type MonitorUsage = z.infer<typeof MonitorUsageSchema>;

export const MonitorObservationSchema = z.object({
  observationId: z.string().min(1),
  observedAt: z.number().finite().nonnegative(),
  expiresAt: z.number().finite().nonnegative().optional(),
  offlineAt: z.number().finite().nonnegative().optional(),
  sourceId: z.string().min(1),
  sourceKind: MonitorSourceKindSchema,
  authority: MonitorAuthoritySchema,
  confidence: MonitorConfidenceSchema,
  providerId: z.string().min(1),
  tool: AgentToolSchema.optional(),
  nativeSessionId: z.string().min(1).optional(),
  sourceLocalId: z.string().min(1).optional(),
  displayName: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  repoRoot: z.string().min(1).optional(),
  worktree: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  state: MonitorAgentStateSchema,
  stateReason: z.string().min(1).optional(),
  currentActivity: z.string().min(1).optional(),
  attentionKind: MonitorAttentionKindSchema.optional(),
  spawnedHere: z.boolean().optional(),
  herdrPaneId: z.string().min(1).optional(),
  usage: MonitorUsageSchema.optional(),
  revision: z.string().min(1).optional(),
});
export type MonitorObservation = z.infer<typeof MonitorObservationSchema>;

export const MonitorControlNameSchema = z.enum([
  "send",
  "steer",
  "interrupt",
  "stop",
  "fork",
  "attach",
  "logs",
  "listProviderSessions",
  "issueDecree",
  "runStandingOrder",
]);
export type MonitorControlName = z.infer<typeof MonitorControlNameSchema>;

export const MonitorControlSchema = z.object({
  action: MonitorControlNameSchema,
  available: z.boolean(),
  reason: z.string().min(1),
});
export type MonitorControl = z.infer<typeof MonitorControlSchema>;

export const MonitorEvidenceSchema = MonitorObservationSchema.pick({
  observationId: true,
  observedAt: true,
  expiresAt: true,
  offlineAt: true,
  sourceId: true,
  sourceKind: true,
  authority: true,
  confidence: true,
  state: true,
  stateReason: true,
  currentActivity: true,
  attentionKind: true,
});
export type MonitorEvidence = z.infer<typeof MonitorEvidenceSchema>;

export const AgentMonitorRecordSchema = z.object({
  agentId: z.string().min(1),
  providerId: z.string().min(1),
  tool: AgentToolSchema.optional(),
  nativeSessionId: z.string().min(1).optional(),
  sourceLocalId: z.string().min(1).optional(),
  displayName: z.string().min(1),
  cwd: z.string().min(1).optional(),
  repoRoot: z.string().min(1).optional(),
  worktree: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  state: MonitorAgentStateSchema,
  stateReason: z.string().min(1),
  authority: MonitorAuthoritySchema,
  confidence: MonitorConfidenceSchema,
  lastObservedAt: z.number().finite().nonnegative(),
  freshUntil: z.number().finite().nonnegative().optional(),
  currentActivity: z.string().min(1).optional(),
  spawnedHere: z.boolean(),
  herdrPaneId: z.string().min(1).optional(),
  sources: z.array(z.string().min(1)),
  evidence: z.array(MonitorEvidenceSchema),
  controls: z.array(MonitorControlSchema),
  usage: MonitorUsageSchema,
});
export type AgentMonitorRecord = z.infer<typeof AgentMonitorRecordSchema>;

export const MonitorAttentionItemSchema = z.object({
  attentionId: z.string().min(1),
  kind: MonitorAttentionKindSchema,
  severity: z.enum(["critical", "warning", "info"]),
  title: z.string().min(1),
  summary: z.string().min(1),
  agentId: z.string().min(1).optional(),
  sourceId: z.string().min(1),
  openedAt: z.number().finite().nonnegative(),
  updatedAt: z.number().finite().nonnegative(),
  lifecycle: z.enum(["open", "acknowledged", "snoozed", "resolved"]),
});
export type MonitorAttentionItem = z.infer<typeof MonitorAttentionItemSchema>;

export const MonitorIntegrationHealthSchema = z.object({
  sourceId: z.string().min(1),
  sourceKind: MonitorSourceKindSchema,
  label: z.string().min(1),
  status: z.enum(["healthy", "degraded", "unavailable"]),
  configured: z.boolean(),
  lastSuccessAt: z.number().finite().nonnegative().optional(),
  lastErrorAt: z.number().finite().nonnegative().optional(),
  lastError: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  capabilities: z.array(z.string().min(1)),
});
export type MonitorIntegrationHealth = z.infer<
  typeof MonitorIntegrationHealthSchema
>;

export const MonitorSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int().nonnegative(),
  generatedAt: z.number().finite().nonnegative(),
  agents: z.array(AgentMonitorRecordSchema),
  attention: z.array(MonitorAttentionItemSchema),
  integrations: z.array(MonitorIntegrationHealthSchema),
});
export type MonitorSnapshot = z.infer<typeof MonitorSnapshotSchema>;

export const MonitorDeltaSchema = z.object({
  schemaVersion: z.literal(1),
  version: z.number().int().nonnegative(),
  generatedAt: z.number().finite().nonnegative(),
  upsertedAgents: z.array(AgentMonitorRecordSchema),
  removedAgentIds: z.array(z.string().min(1)),
  attention: z.array(MonitorAttentionItemSchema),
  integrations: z.array(MonitorIntegrationHealthSchema),
});
export type MonitorDelta = z.infer<typeof MonitorDeltaSchema>;
