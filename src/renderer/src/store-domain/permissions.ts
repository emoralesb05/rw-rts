import type {
  AgentEvent,
  Letter,
  LetterAction,
  LetterRisk,
} from "@shared/events";
import type {
  PermissionOption,
  ResolvePermissionRequest,
} from "@shared/schemas";
import {
  permissionCapabilityForTool,
  permissionOptionsForPayload,
} from "@shared/provider-permissions";

export function summarizePermissionInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const r = input as Record<string, unknown>;
  if (typeof r.command === "string") return r.command.slice(0, 200);
  if (typeof r.file_path === "string") return r.file_path;
  if (typeof r.path === "string") return r.path;
  if (typeof r.url === "string") return r.url.slice(0, 200);
  if (typeof r.pattern === "string") return r.pattern;
  return "";
}

export function isObservationOnlyPermission(event: AgentEvent): boolean {
  const mode =
    event.payload.permissionMode ??
    permissionCapabilityForTool(event.tool).mode;
  return mode === "observe";
}

export function permissionActionsForEvent(
  event: AgentEvent
): Letter["actions"] {
  const requestId = event.payload.requestId;
  if (!requestId) return [];
  const options = permissionOptionsForPayload(event.tool, event.payload);
  return permissionActionsForOptions(requestId, options);
}

export function permissionActionsForOptions(
  requestId: string,
  options: readonly PermissionOption[]
): Letter["actions"] {
  return options.map((option) => {
    if (option.decision === "observe") {
      return {
        label: option.label,
        action: {
          kind: "permission-observe",
          requestId,
          optionId: option.id,
        },
      };
    }
    if (option.decision === "deny") {
      return {
        label: option.label,
        action: {
          kind: "permission-deny",
          requestId,
          optionId: option.id,
        },
      };
    }
    return {
      label: option.label,
      action: {
        kind: "permission-allow",
        requestId,
        optionId: option.id,
      },
    };
  });
}

export function classifyPermissionRisk(
  toolName: string,
  input: unknown
): LetterRisk {
  const tool = toolName.toLowerCase();
  const r = (input as Record<string, unknown>) || {};
  if (
    tool === "read" ||
    tool === "glob" ||
    tool === "grep" ||
    tool === "webfetch" ||
    tool === "websearch"
  ) {
    return "low";
  }
  if (tool === "bash") {
    const cmd = String(r.command ?? "").toLowerCase();
    if (
      /\bsudo\b/.test(cmd) ||
      /\bchmod\b.+(?:777|-r)/.test(cmd) ||
      /\bchown\b/.test(cmd) ||
      /\brm\b.+\b-(?:rf|fr|Rf)\b/.test(cmd) ||
      /\bdd\b\s+if=/.test(cmd) ||
      /\bmkfs\b/.test(cmd) ||
      /\bgit\s+push\s+(?:--force|-f)\b/.test(cmd) ||
      /\bgit\s+reset\s+--hard\b/.test(cmd)
    ) {
      return "high";
    }
    return "elevated";
  }
  if (tool === "write" || tool === "edit" || tool === "multiedit") {
    const path = String(r.file_path ?? r.path ?? "");
    if (
      path.startsWith("/etc/") ||
      path.startsWith("/usr/") ||
      path.startsWith("/System/") ||
      path.startsWith("/var/") ||
      /\.(ssh|aws|gnupg)\//.test(path) ||
      /\.(bash_profile|zshrc|zprofile|netrc)$/.test(path)
    ) {
      return "high";
    }
    return "elevated";
  }
  return "elevated";
}

export function extractRecentReasoning(
  events: readonly AgentEvent[],
  sessionId: string
): string {
  for (const ev of events) {
    if (ev.sessionId !== sessionId) continue;
    if (ev.kind !== "assistant_text") continue;
    const text = String(ev.payload.text ?? "").trim();
    if (!text) continue;
    return text.length > 480 ? text.slice(0, 480) + "…" : text;
  }
  return "";
}

export function argKeyForToolInput(input: unknown): string {
  if (!input || typeof input !== "object") return "*";
  const r = input as Record<string, unknown>;
  if (typeof r.file_path === "string") return `file:${r.file_path}`;
  if (typeof r.path === "string") return `file:${r.path}`;
  if (typeof r.command === "string") return `cmd:${r.command.slice(0, 80)}`;
  if (typeof r.pattern === "string") return `glob:${r.pattern}`;
  if (typeof r.url === "string") return `url:${r.url.slice(0, 80)}`;
  return "*";
}

export function isPermissionLetter(letter: Letter): boolean {
  return letter.actions.some(
    (a) =>
      a.action.kind === "permission-allow" ||
      a.action.kind === "permission-deny"
  );
}

export function dismissInformationalLetters(
  letters: readonly Letter[]
): Letter[] {
  return letters.filter((l) => isPermissionLetter(l));
}

export function permissionResolutionForAction(
  action: LetterAction
): ResolvePermissionRequest | null {
  switch (action.kind) {
    case "permission-allow": {
      const req: ResolvePermissionRequest = {
        requestId: action.requestId,
        decision: "allow",
      };
      if (action.optionId) req.optionId = action.optionId;
      return req;
    }
    case "permission-deny": {
      const req: ResolvePermissionRequest = {
        requestId: action.requestId,
        decision: "deny",
      };
      if (action.message) req.message = action.message;
      if (action.optionId) req.optionId = action.optionId;
      return req;
    }
    default:
      return null;
  }
}
