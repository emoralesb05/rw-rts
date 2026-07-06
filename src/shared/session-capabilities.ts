import type { UnitState } from "./events";
import type { AgentTool } from "./schemas/common";

export type SessionControlName =
  | "send"
  | "steer"
  | "interrupt"
  | "stop"
  | "fork"
  | "attach"
  | "logs"
  | "listProviderSessions"
  | "issueDecree"
  | "runStandingOrder";

export const SESSION_CONTROL_NAMES = [
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
] as const satisfies readonly SessionControlName[];

export type PermissionAuthority =
  | "realmkeeper"
  | "provider-native"
  | "observe-only";

export type SessionCapability = {
  available: boolean;
  reason: string;
};

export type SessionCapabilities = {
  controls: Record<SessionControlName, SessionCapability>;
  permissionAuthority: PermissionAuthority;
  notes: string[];
};

export type SessionCapabilityInput = {
  tool: AgentTool;
  spawnedHere: boolean;
  status?: UnitState["status"];
  activeTurnKnown?: boolean;
};

const ACTIVE_STATUSES = new Set<UnitState["status"]>([
  "working",
  "casting",
  "moving",
]);

function available(reason: string): SessionCapability {
  return { available: true, reason };
}

function unavailable(reason: string): SessionCapability {
  return { available: false, reason };
}

function isTerminalStatus(status: UnitState["status"] | undefined): boolean {
  return status === "complete" || status === "fallen";
}

function providerName(tool: AgentTool): string {
  switch (tool) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "gemini":
      return "Gemini";
  }
}

function permissionAuthorityFor(tool: AgentTool): PermissionAuthority {
  if (tool === "cursor") return "observe-only";
  return "realmkeeper";
}

function baseControls(
  reason: string
): Record<SessionControlName, SessionCapability> {
  return {
    send: unavailable(reason),
    steer: unavailable(reason),
    interrupt: unavailable(reason),
    stop: unavailable(reason),
    fork: unavailable(reason),
    attach: unavailable(reason),
    logs: unavailable(reason),
    listProviderSessions: unavailable(reason),
    issueDecree: unavailable(reason),
    runStandingOrder: unavailable(reason),
  };
}

export function resolveSessionCapabilities(
  input: SessionCapabilityInput
): SessionCapabilities {
  const terminal = isTerminalStatus(input.status);
  if (terminal) {
    return {
      controls: baseControls("This wielder is no longer active."),
      permissionAuthority: permissionAuthorityFor(input.tool),
      notes: [`${providerName(input.tool)} session has ended.`],
    };
  }

  const provider = providerName(input.tool);
  const sourceReason = input.spawnedHere
    ? "Realmkeeper owns this process."
    : `${provider} can be resumed by session id, but Realmkeeper does not own the original process.`;

  const controls = baseControls(`${provider} control is not available.`);
  controls.send = available(sourceReason);

  if (input.spawnedHere) {
    controls.stop = available("Realmkeeper can stop the process it spawned.");
    controls.issueDecree = available(
      "Decrees are available for Realmkeeper-owned sessions."
    );
    controls.runStandingOrder = available(
      "Standing Orders are available for Realmkeeper-owned sessions."
    );
  } else {
    controls.stop = unavailable(
      "Realmkeeper did not spawn this process, so recall cannot stop it."
    );
    controls.issueDecree = unavailable(
      "Decrees stay scoped to Realmkeeper-owned sessions."
    );
    controls.runStandingOrder = unavailable(
      "Standing Orders stay scoped to Realmkeeper-owned sessions."
    );
  }

  switch (input.tool) {
    case "codex": {
      const activeTurn =
        input.activeTurnKnown ??
        (input.status ? ACTIVE_STATUSES.has(input.status) : false);
      if (input.spawnedHere && activeTurn) {
        controls.steer = available(
          "Codex app-server can steer an active turn."
        );
        controls.interrupt = available(
          "Codex app-server can interrupt the active turn."
        );
      } else if (!input.spawnedHere) {
        controls.steer = unavailable(
          "Observed Codex sessions are resumed with a new turn, not steered in place."
        );
        controls.interrupt = unavailable(
          "Realmkeeper can only interrupt Codex turns it owns through app-server."
        );
      } else {
        controls.steer = unavailable(
          "Codex has no active turn to steer right now."
        );
        controls.interrupt = unavailable(
          "Codex has no active turn to interrupt right now."
        );
      }
      controls.fork = available("Codex app-server can fork known threads.");
      controls.attach = unavailable(
        "Codex native attach/open controls are not wired yet."
      );
      controls.logs = unavailable("Codex native logs are not wired yet.");
      controls.listProviderSessions = available(
        "Codex app-server can list known threads."
      );
      break;
    }
    case "claude":
      controls.steer = unavailable(
        "Claude resume sends another turn; it does not steer a running TUI turn."
      );
      controls.interrupt = unavailable(
        "Claude background stop/remote-control still needs a live Realmkeeper probe."
      );
      controls.fork = unavailable(
        "Claude --fork-session is known but not wired into Realmkeeper yet."
      );
      controls.attach = available(
        "Claude can attach to native agent sessions in Terminal."
      );
      controls.logs = available(
        "Claude can print recent native agent session logs."
      );
      controls.listProviderSessions = available(
        "Claude can list native agent sessions."
      );
      break;
    case "cursor":
      controls.steer = unavailable(
        "Cursor CLI resume sends another turn; IDE sessions are observe-only."
      );
      controls.interrupt = unavailable(
        "Cursor observed IDE control is not authoritative from Realmkeeper."
      );
      controls.fork = unavailable("Cursor chat fork is not wired yet.");
      controls.attach = unavailable("Cursor IDE attach is not wired yet.");
      controls.logs = unavailable("Cursor IDE logs are not wired yet.");
      controls.listProviderSessions = unavailable(
        "Cursor chat discovery is not wired yet."
      );
      break;
    case "gemini":
      controls.steer = unavailable(
        "Gemini resume sends another prompt; ACP live steering is not wired."
      );
      controls.interrupt = unavailable(
        "Gemini live interrupt is not wired into Realmkeeper yet."
      );
      controls.fork = unavailable("Gemini session fork is not wired yet.");
      controls.attach = unavailable("Gemini native attach is not wired yet.");
      controls.logs = unavailable("Gemini native logs are not wired yet.");
      controls.listProviderSessions = unavailable(
        "Gemini --list-sessions is diagnostic only for now."
      );
      break;
  }

  return {
    controls,
    permissionAuthority: permissionAuthorityFor(input.tool),
    notes: [
      input.spawnedHere
        ? `${provider} session was spawned by Realmkeeper.`
        : `${provider} session is observed or resumed by Realmkeeper.`,
    ],
  };
}

export function capabilitiesForUnit(
  unit: UnitState,
  opts: { activeTurnKnown?: boolean } = {}
): SessionCapabilities {
  return resolveSessionCapabilities({
    tool: unit.tool,
    spawnedHere: unit.spawnedHere,
    status: unit.status,
    activeTurnKnown: opts.activeTurnKnown,
  });
}

export function canControl(
  capabilities: SessionCapabilities,
  control: SessionControlName
): boolean {
  return capabilities.controls[control].available;
}

export function controlReason(
  capabilities: SessionCapabilities,
  control: SessionControlName
): string {
  return capabilities.controls[control].reason;
}
