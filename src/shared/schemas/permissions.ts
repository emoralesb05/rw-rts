import { z } from "zod";
import { AgentToolSchema } from "./common";

export const PermissionDecisionSchema = z.enum(["allow", "deny"]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

export const PermissionOptionDecisionSchema = z.enum([
  "allow",
  "deny",
  "observe",
]);
export type PermissionOptionDecision = z.infer<
  typeof PermissionOptionDecisionSchema
>;

export const PermissionOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  decision: PermissionOptionDecisionSchema,
  description: z.string().optional(),
  requiresMessage: z.boolean().optional(),
  variant: z.enum(["primary", "danger", "secondary"]).optional(),
});
export type PermissionOption = z.infer<typeof PermissionOptionSchema>;

export const PermissionChoiceIdSchema = z.enum([
  "allow-once",
  "deny",
  "allow-session",
  "allow-workspace",
  "allow-global",
  "deny-session",
  "deny-workspace",
  "deny-global",
]);
export type PermissionChoiceId = z.infer<typeof PermissionChoiceIdSchema>;

export const PermissionRuleBehaviorSchema = PermissionDecisionSchema;
export type PermissionRuleBehavior = z.infer<
  typeof PermissionRuleBehaviorSchema
>;

export const PermissionRuleScopeSchema = z.enum([
  "session",
  "workspace",
  "global",
]);
export type PermissionRuleScope = z.infer<typeof PermissionRuleScopeSchema>;

export const PermissionRuleMatcherSchema = z.object({
  toolName: z.string().min(1).optional(),
  argKey: z.string().min(1).optional(),
});
export type PermissionRuleMatcher = z.infer<typeof PermissionRuleMatcherSchema>;

export const PermissionRuleSchema = z.object({
  id: z.string().min(1),
  provider: AgentToolSchema,
  behavior: PermissionRuleBehaviorSchema,
  scope: PermissionRuleScopeSchema,
  sessionId: z.string().min(1).optional(),
  repoRoot: z.string().min(1).optional(),
  cwd: z.string().min(1).optional(),
  matcher: PermissionRuleMatcherSchema,
  label: z.string().min(1),
  createdAt: z.number().finite().nonnegative(),
  sourceRequestId: z.string().min(1).optional(),
});
export type PermissionRule = z.infer<typeof PermissionRuleSchema>;

export const PermissionRulesFileSchema = z.object({
  schemaVersion: z.literal(1),
  rules: z.array(PermissionRuleSchema),
});
export type PermissionRulesFile = z.infer<typeof PermissionRulesFileSchema>;
