import type { AgentTool } from "./schemas/common";
import {
  PermissionOptionSchema,
  type PermissionRuleMatcher,
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

export function parsePermissionOptions(
  value: unknown
): PermissionOption[] | null {
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

export function permissionArgKeyForInput(input: unknown): string {
  if (!input || typeof input !== "object") return "*";
  const r = input as Record<string, unknown>;
  if (typeof r.file_path === "string") return `file:${r.file_path}`;
  if (typeof r.path === "string") return `file:${r.path}`;
  if (typeof r.absolute_path === "string") return `file:${r.absolute_path}`;
  if (typeof r.command === "string") return `cmd:${r.command.slice(0, 80)}`;
  if (typeof r.pattern === "string") return `glob:${r.pattern}`;
  if (typeof r.url === "string") return `url:${r.url.slice(0, 80)}`;
  return "*";
}

export function permissionMatcherForRequest(
  name: unknown,
  input: unknown
): PermissionRuleMatcher {
  const matcher: PermissionRuleMatcher = {};
  if (typeof name === "string" && name.trim()) matcher.toolName = name.trim();
  const argKey = permissionArgKeyForInput(input);
  if (argKey !== "*") matcher.argKey = argKey;
  return matcher;
}

export function permissionRuleLabel(args: {
  behavior: "allow" | "deny";
  scope: "session" | "workspace" | "global";
  matcher: PermissionRuleMatcher;
}): string {
  const subject = args.matcher.argKey
    ? `${args.matcher.toolName ?? "tool"} ${args.matcher.argKey}`
    : (args.matcher.toolName ?? "matching request");
  return `${args.behavior} ${subject} for ${args.scope}`;
}
