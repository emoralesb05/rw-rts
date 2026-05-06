import { z } from "zod";

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
