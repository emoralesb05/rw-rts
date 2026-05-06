import type { AgentTool } from "./schemas/common";
import {
  PermissionOptionSchema,
  type PermissionOption,
} from "./schemas/permissions";

export type ProviderPermissionMode = "actionable" | "observe";

export type ProviderPermissionCapability = {
  tool: AgentTool;
  label: string;
  mode: ProviderPermissionMode;
  options: PermissionOption[];
};

const ACTIONABLE_OPTIONS: PermissionOption[] = [
  {
    id: "allow-once",
    label: "allow",
    decision: "allow",
    description: "Approve this request.",
    variant: "primary",
  },
  {
    id: "deny",
    label: "deny",
    decision: "deny",
    description: "Block this request.",
    requiresMessage: true,
    variant: "danger",
  },
];

const OBSERVE_OPTIONS: PermissionOption[] = [
  {
    id: "ack-native",
    label: "ack",
    decision: "observe",
    description: "Dismiss after deciding in the provider's native UI.",
    variant: "secondary",
  },
];

export const PROVIDER_PERMISSION_CAPABILITIES: Record<
  AgentTool,
  ProviderPermissionCapability
> = {
  claude: {
    tool: "claude",
    label: "Claude",
    mode: "actionable",
    options: ACTIONABLE_OPTIONS,
  },
  codex: {
    tool: "codex",
    label: "Codex",
    mode: "actionable",
    options: ACTIONABLE_OPTIONS,
  },
  gemini: {
    tool: "gemini",
    label: "Gemini",
    mode: "actionable",
    options: ACTIONABLE_OPTIONS,
  },
  cursor: {
    tool: "cursor",
    label: "Cursor",
    mode: "observe",
    options: OBSERVE_OPTIONS,
  },
};

export function permissionCapabilityForTool(
  tool: AgentTool
): ProviderPermissionCapability {
  return PROVIDER_PERMISSION_CAPABILITIES[tool];
}

export function permissionOptionsForTool(tool: AgentTool): PermissionOption[] {
  return permissionCapabilityForTool(tool).options.map((option) => ({
    ...option,
  }));
}

export function parsePermissionOptions(value: unknown): PermissionOption[] | null {
  const parsed = PermissionOptionSchema.array().safeParse(value);
  if (!parsed.success) return null;
  return parsed.data;
}

export function permissionOptionsForPayload(
  tool: AgentTool,
  payload: { permissionOptions?: unknown }
): PermissionOption[] {
  return (
    parsePermissionOptions(payload.permissionOptions) ??
    permissionOptionsForTool(tool)
  );
}
