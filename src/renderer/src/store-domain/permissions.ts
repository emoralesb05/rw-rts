import type {
  AgentEvent,
  Letter,
  LetterAction,
  LetterRisk,
} from "@shared/events";
import type {
  PermissionOption,
  ResolvePermissionRequest,
  ResolveUserInputRequest,
  UserInputQuestion,
} from "@shared/schemas";
import { UserInputQuestionSchema } from "@shared/schemas";
import {
  permissionCapabilityForTool,
  permissionArgKeyForInput,
  permissionOptionsForPayload,
} from "@shared/provider-permissions";

export { permissionArgKeyForInput as argKeyForToolInput } from "@shared/provider-permissions";

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
  const actions = permissionActionsForOptions(requestId, options);
  if (isObservationOnlyPermission(event)) return actions;
  if (!canBuildPersistentPermissionChoice(event)) return actions;

  const allowOption = options.find((option) => option.decision === "allow");
  const denyOption = options.find((option) => option.decision === "deny");
  return [
    ...actions,
    ...(allowOption
      ? [
          {
            label: "allow session",
            action: {
              kind: "permission-choice" as const,
              requestId,
              choiceId: "allow-session" as const,
              optionId: allowOption.id,
            },
          },
          {
            label: "allow workspace",
            action: {
              kind: "permission-choice" as const,
              requestId,
              choiceId: "allow-workspace" as const,
              optionId: allowOption.id,
            },
          },
        ]
      : []),
    ...(denyOption
      ? [
          {
            label: "deny workspace",
            action: {
              kind: "permission-choice" as const,
              requestId,
              choiceId: "deny-workspace" as const,
              optionId: denyOption.id,
            },
          },
        ]
      : []),
  ];
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

export function isPermissionLetter(letter: Letter): boolean {
  return letter.actions.some(
    (a) =>
      a.action.kind === "permission-allow" ||
      a.action.kind === "permission-deny" ||
      a.action.kind === "permission-choice"
  );
}

export function isUserInputLetter(letter: Letter): boolean {
  return letter.actions.some((a) => a.action.kind === "user-input-submit");
}

export function dismissInformationalLetters(
  letters: readonly Letter[]
): Letter[] {
  return letters.filter((l) => isPermissionLetter(l) || isUserInputLetter(l));
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

export function isPermissionChoiceAction(action: LetterAction): boolean {
  return action.kind === "permission-choice";
}

function canBuildPersistentPermissionChoice(event: AgentEvent): boolean {
  return (
    typeof event.payload.name === "string" &&
    !!event.payload.name.trim() &&
    permissionArgKeyForInput(event.payload.input) !== "*"
  );
}

export function userInputQuestionsForEvent(
  event: AgentEvent
): UserInputQuestion[] {
  const parsed = UserInputQuestionSchema.array().safeParse(
    event.payload.questions
  );
  return parsed.success ? parsed.data : [];
}

export function userInputResolutionForAction(
  action: LetterAction
): ResolveUserInputRequest | null {
  if (action.kind !== "user-input-submit") return null;
  const req: ResolveUserInputRequest = {
    requestId: action.requestId,
    answers: action.answers ?? {},
  };
  if (action.responseKind) req.responseKind = action.responseKind;
  if (action.responseAction) req.responseAction = action.responseAction;
  return req;
}
