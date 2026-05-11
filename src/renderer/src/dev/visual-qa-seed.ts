import type {
  AgentEvent,
  Heartless,
  Letter,
  PersistedState,
  UnitState,
  WorldAlertLevel,
  WorldState,
} from "@shared/events";
import type { AgentTool } from "@shared/schemas";
import { WORLD_THEMES, themeFor, type WorldTheme } from "../game/gummi-worlds";
import { unitIdentityForUnit, useStore } from "../store";

type SeedUnit = Pick<
  UnitState,
  "id" | "tool" | "role" | "displayName" | "repoRoot" | "status" | "hp" | "mp"
> & {
  lastTool?: string;
  parentSessionId?: string;
};

type SeedWorld = {
  alertLevel: WorldAlertLevel;
  heartless: Heartless["type"][];
  label: string;
  repoRoot: string;
  theme: WorldTheme;
  units: SeedUnit[];
};

const THEME_WORLD_ID_CACHE = new Map<WorldTheme, string>();

function worldIdForTheme(theme: WorldTheme): string {
  let cached = THEME_WORLD_ID_CACHE.get(theme);
  if (cached) return cached;
  for (let i = 0; i < 500; i++) {
    const candidate = `visual-qa-${theme}-${i}`;
    if (themeFor(candidate) === theme) {
      cached = candidate;
      THEME_WORLD_ID_CACHE.set(theme, cached);
      return cached;
    }
  }
  return `visual-qa-${theme}`;
}

function event(
  unit: UnitState,
  kind: AgentEvent["kind"],
  timestamp: number,
  payload: AgentEvent["payload"] = {}
): AgentEvent {
  return {
    sessionId: unit.id,
    tool: unit.tool,
    cwd: unit.cwd,
    repoRoot: unit.repoRoot,
    timestamp,
    kind,
    payload,
    source: "spawned",
  };
}

function seedHeartless(
  worldId: string,
  types: Heartless["type"][],
  now: number,
  targetUnitId?: string
): Heartless[] {
  return types.map((type, index) => ({
    id: `${worldId}-heartless-${index}`,
    type,
    worldId,
    targetUnitId,
    hp: type === "large_body" ? 4 : type === "soldier" ? 2 : 1,
    spawnedAt: now - 15_000 + index * 1200,
  }));
}

function createSeedUnit(
  worldId: string,
  repoRoot: string,
  unit: SeedUnit,
  now: number,
  index: number
): UnitState {
  return {
    id: unit.id,
    sessionId: unit.id,
    tool: unit.tool,
    role: unit.role,
    displayName: unit.displayName,
    cwd: repoRoot,
    repoRoot,
    worldId,
    hp: unit.hp,
    mp: unit.mp,
    status: unit.status,
    lastActivity: now - (index + 1) * 2400,
    spawnedAt: now - 80_000 + index * 5000,
    lastTool: unit.lastTool,
    spawnedHere: false,
    parentSessionId: unit.parentSessionId,
    driveForm: unit.parentSessionId ? "final" : undefined,
    driveFormUntil: unit.parentSessionId ? now + 30_000 : undefined,
  };
}

export function createVisualQaSeed(now = Date.now()) {
  const worldsToSeed: SeedWorld[] = [
    {
      theme: "traverse",
      label: "Traverse Town Ops",
      repoRoot: "/tmp/keykeeper-qa/traverse-town",
      alertLevel: "danger",
      heartless: ["shadow", "soldier", "large_body"],
      units: [
        {
          id: "qa-vaelen",
          tool: "gemini",
          role: "keyblader1",
          displayName: "Vaelen",
          repoRoot: "/tmp/keykeeper-qa/traverse-town",
          status: "working",
          hp: 88,
          mp: 64,
          lastTool: "Bash",
        },
        {
          id: "qa-selene",
          tool: "codex",
          role: "keyblader2",
          displayName: "Selene",
          repoRoot: "/tmp/keykeeper-qa/traverse-town",
          status: "casting",
          hp: 74,
          mp: 82,
          lastTool: "apply_patch",
        },
        {
          id: "qa-guard",
          tool: "claude",
          role: "keyblader4",
          displayName: "Lyris",
          repoRoot: "/tmp/keykeeper-qa/traverse-town",
          status: "working",
          hp: 72,
          mp: 58,
          lastTool: "Task",
          parentSessionId: "qa-vaelen",
        },
      ],
    },
    {
      theme: "hollow",
      label: "Hollow Bastion Gate",
      repoRoot: "/tmp/keykeeper-qa/hollow-bastion",
      alertLevel: "warning",
      heartless: ["soldier", "shadow"],
      units: [
        {
          id: "qa-ryder",
          tool: "claude",
          role: "keyblader3",
          displayName: "Ryder",
          repoRoot: "/tmp/keykeeper-qa/hollow-bastion",
          status: "fallen",
          hp: 0,
          mp: 28,
          lastTool: "WebSearch",
        },
      ],
    },
    {
      theme: "destiny",
      label: "Destiny Islands Build",
      repoRoot: "/tmp/keykeeper-qa/destiny-islands",
      alertLevel: "active",
      heartless: ["shadow"],
      units: [
        {
          id: "qa-marin",
          tool: "cursor",
          role: "keyblader4",
          displayName: "Marin",
          repoRoot: "/tmp/keykeeper-qa/destiny-islands",
          status: "working",
          hp: 96,
          mp: 70,
          lastTool: "web_search",
        },
      ],
    },
    {
      theme: "disney",
      label: "Disney Castle Archive",
      repoRoot: "/tmp/keykeeper-qa/disney-castle",
      alertLevel: "cleared",
      heartless: [],
      units: [
        {
          id: "qa-aurelia",
          tool: "codex",
          role: "keyblader2",
          displayName: "Aurelia",
          repoRoot: "/tmp/keykeeper-qa/disney-castle",
          status: "complete",
          hp: 100,
          mp: 44,
          lastTool: "write",
        },
      ],
    },
    {
      theme: "twilight",
      label: "Twilight Town Standby",
      repoRoot: "/tmp/keykeeper-qa/twilight-town",
      alertLevel: "idle",
      heartless: [],
      units: [
        {
          id: "qa-orion",
          tool: "gemini",
          role: "keyblader1",
          displayName: "Orion",
          repoRoot: "/tmp/keykeeper-qa/twilight-town",
          status: "idle",
          hp: 100,
          mp: 100,
        },
      ],
    },
    {
      theme: "halloween",
      label: "Halloween Town Review",
      repoRoot: "/tmp/keykeeper-qa/halloween-town",
      alertLevel: "active",
      heartless: [],
      units: [
        {
          id: "qa-noct",
          tool: "claude",
          role: "keyblader3",
          displayName: "Noct",
          repoRoot: "/tmp/keykeeper-qa/halloween-town",
          status: "idle",
          hp: 92,
          mp: 90,
          lastTool: "Read",
        },
      ],
    },
  ];

  const units: Record<string, UnitState> = {};
  const worlds: Record<string, WorldState> = {};
  let unitIndex = 0;
  for (const seedWorld of worldsToSeed) {
    const worldId = worldIdForTheme(seedWorld.theme);
    const worldUnits = seedWorld.units.map((unit) =>
      createSeedUnit(worldId, seedWorld.repoRoot, unit, now, unitIndex++)
    );
    for (const unit of worldUnits) {
      units[unit.id] = unit;
    }
    worlds[worldId] = {
      id: worldId,
      path: seedWorld.repoRoot,
      label: seedWorld.label,
      unitIds: worldUnits.map((unit) => unit.id),
      heartless: seedHeartless(
        worldId,
        seedWorld.heartless,
        now,
        worldUnits[0]?.id
      ),
      alertLevel: seedWorld.alertLevel,
      munny: seedWorld.alertLevel === "cleared" ? 180 : 35,
    };
  }

  const allUnits = Object.values(units);
  const events: AgentEvent[] = [
    event(allUnits[0], "permission_request", now - 4000, {
      name: "Bash",
      input: { command: "bun run build" },
      requestId: "visual-qa-permission",
    }),
    event(allUnits[1], "tool_use", now - 7000, {
      name: "apply_patch",
      input: { file: "src/renderer/src/game/scenes/Kingdom.ts" },
    }),
    event(allUnits[2], "subagent_spawn", now - 9000, {
      parentSessionId: "qa-vaelen",
    }),
    event(allUnits[3], "error", now - 12_000, {
      error: "Fixture pressure event",
    }),
    event(allUnits[4], "tool_result", now - 15_000, {
      name: "web_search",
      output: "Recovered current context",
    }),
    event(allUnits[5], "session_end", now - 18_000, {}),
  ];

  const letters: Letter[] = [
    {
      id: "visual-qa-permission-letter",
      createdAt: now - 3500,
      severity: "critical",
      title: "Vaelen asks to use Bash",
      body: "Bash: bun run build",
      worldId: allUnits[0].worldId,
      sessionId: allUnits[0].id,
      risk: "elevated",
      actions: [
        {
          label: "allow",
          action: {
            kind: "permission-allow",
            requestId: "visual-qa-permission",
          },
        },
        {
          label: "deny",
          action: {
            kind: "permission-deny",
            requestId: "visual-qa-permission",
          },
        },
      ],
    },
    {
      id: "visual-qa-seal-letter",
      createdAt: now - 16_000,
      severity: "important",
      title: "Aurelia finished in Disney Castle Archive",
      body: "Plan complete? Seal the keyhole or iterate.",
      worldId: allUnits[5].worldId,
      sessionId: allUnits[5].id,
      actions: [
        {
          label: "seal keyhole",
          action: { kind: "seal", worldId: allUnits[5].worldId },
        },
        { label: "dismiss", action: { kind: "dismiss" } },
      ],
    },
    {
      id: "visual-qa-prompt-letter",
      createdAt: now - 2500,
      severity: "important",
      title: "Noct needs direction in Halloween Town Review",
      body: "The mission is waiting on a player instruction.",
      worldId: allUnits[7].worldId,
      sessionId: allUnits[7].id,
      actions: [
        {
          label: "send word",
          action: { kind: "send-word", sessionId: allUnits[7].id },
        },
        { label: "dismiss", action: { kind: "dismiss" } },
      ],
    },
  ];

  const persisted: PersistedState = {
    schemaVersion: 2,
    kingdomFoundedAt: now - 3 * 86400_000,
    totalMunnyEver: 420,
    standingOrders: [],
    worlds: Object.fromEntries(
      Object.values(worlds).map((world) => [
        world.path,
        {
          repoRoot: world.path,
          lastVisit: now - 4000,
          totalSeals: world.alertLevel === "cleared" ? 2 : 0,
          totalClears: world.alertLevel === "cleared" ? 2 : 0,
          totalFalls: world.alertLevel === "warning" ? 1 : 0,
          sealedAt: world.alertLevel === "cleared" ? now - 12_000 : undefined,
        },
      ])
    ),
    wielders: Object.fromEntries(
      allUnits.map((unit, index) => {
        const identity = unitIdentityForUnit(unit);
        return [
          identity,
          {
            tool: unit.tool as AgentTool,
            repoRoot: unit.repoRoot ?? unit.cwd,
            visits: index === 0 ? 13 : index + 2,
            seals: unit.status === "complete" ? 2 : index % 2,
            falls: unit.status === "fallen" ? 1 : 0,
            totalMunny: 30 + index * 12,
            lastSeen: now - index * 5000,
          },
        ];
      })
    ),
  };

  return {
    activeWorldId: allUnits[0].worldId,
    cameraTarget: allUnits[0].worldId,
    cameraTargetVersion: useStore.getState().cameraTargetVersion + 1,
    eventCount: events.length,
    events,
    letters,
    persisted,
    selectedUnitId: allUnits[0].id,
    units,
    worlds,
  };
}

export function seedVisualQaState(now = Date.now()) {
  const seed = createVisualQaSeed(now);
  useStore.setState(seed);
  const scene = (
    window as unknown as {
      __phaser?: {
        scene?: { getScene?: (key: string) => unknown };
      };
    }
  ).__phaser?.scene?.getScene?.("kingdom") as
    | {
        lastWorldsKey?: string;
        renownTiers?: Map<string, unknown>;
        seenLetterCounts?: Map<string, unknown>;
        seenLetterIds?: Set<string>;
      }
    | undefined;
  if (scene) {
    scene.lastWorldsKey = "";
    scene.seenLetterIds?.clear();
    scene.seenLetterCounts?.clear();
    scene.renownTiers?.clear();
    const firstUnit = Object.values(seed.units)[0];
    if (firstUnit) {
      scene.renownTiers?.set(unitIdentityForUnit(firstUnit), "New");
    }
  }
  window.dispatchEvent(
    new CustomEvent("kh:visual-qa-seeded", { detail: seed })
  );
  return seed;
}

export function visualQaThemeCoverage() {
  return WORLD_THEMES.map((theme) => ({
    theme,
    worldId: worldIdForTheme(theme),
  }));
}
