import { z } from "zod";

export const AgentToolSchema = z.enum(["claude", "cursor", "codex", "gemini"]);
export type AgentTool = z.infer<typeof AgentToolSchema>;

export const NonNegativeNumberSchema = z.number().finite().nonnegative();
export const NonNegativeIntSchema = z.number().int().nonnegative();
