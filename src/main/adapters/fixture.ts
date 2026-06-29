/**
 * Fixture / demo mode — fires scripted AgentEvent sequences on timers so we
 * can iterate visuals, sound, chat layout, and animations without burning
 * real API tokens.
 *
 * Pure event-emit; no subprocess. Scenarios target the same roles + worlds
 * the live adapters do, so the rendering pipeline behaves identically.
 */

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { bus } from "../event-bus";
import {
  archetypeFor,
  type AgentEvent,
  type AgentTool,
  type UnitRole,
} from "@shared/events";

type ScriptedEvent = {
  delayMs: number;
  kind: AgentEvent["kind"];
  toolName?: string;
  text?: string;
  input?: unknown;
  output?: unknown;
  parentSessionId?: string;
};

type FakeUnit = {
  sessionId: string;
  tool: AgentTool;
  cwd: string;
  events: ScriptedEvent[];
};

const activeTimers = new Map<string, NodeJS.Timeout[]>();

function schedule(unit: FakeUnit) {
  const timers: NodeJS.Timeout[] = [];
  let elapsed = 0;
  for (const ev of unit.events) {
    elapsed += ev.delayMs;
    const t = setTimeout(() => {
      bus.emitAgentEvent({
        sessionId: unit.sessionId,
        tool: unit.tool,
        cwd: unit.cwd,
        timestamp: Date.now(),
        kind: ev.kind,
        payload: {
          name: ev.toolName,
          input: ev.input,
          output: ev.output,
          text: ev.text,
          parentSessionId: ev.parentSessionId,
        },
        source: "spawned",
      });
    }, elapsed);
    timers.push(t);
  }
  // Stop tracking after the last event finishes
  const cleanup = setTimeout(
    () => activeTimers.delete(unit.sessionId),
    elapsed + 100
  );
  timers.push(cleanup);
  activeTimers.set(unit.sessionId, timers);
}

function claudeStarter(cwd: string): FakeUnit {
  return {
    sessionId: randomUUID(),
    tool: "claude",
    cwd,
    events: [
      { delayMs: 100, kind: "session_start", text: "look around the repo" },
      {
        delayMs: 600,
        kind: "tool_use",
        toolName: "Read",
        input: { file_path: `${cwd}/package.json` },
      },
      {
        delayMs: 700,
        kind: "tool_result",
        output: '{ "name": "realmkeeper", "version": "0.0.1" }',
      },
      {
        delayMs: 900,
        kind: "assistant_text",
        text: "It's an Electron desktop app called **Realmkeeper**. Stack: Electron, Phaser 4, React 19, Streamdown.\n\nLet me check the source.",
      },
      {
        delayMs: 800,
        kind: "tool_use",
        toolName: "Glob",
        input: { pattern: "src/**/*.ts" },
      },
      { delayMs: 600, kind: "tool_result", output: "31 files" },
      {
        delayMs: 1100,
        kind: "assistant_text",
        text: "31 source files across `main/`, `renderer/`, `preload/`, `shared/`. Multi-tool agent visualizer. Want me to dig into a specific area?",
      },
      { delayMs: 600, kind: "session_end", text: "exit 0" },
    ],
  };
}

function cursorTurn(cwd: string): FakeUnit {
  return {
    sessionId: `cursor-fixture-${randomUUID()}`,
    tool: "cursor",
    cwd,
    events: [
      { delayMs: 200, kind: "session_start", text: "Cursor demo turn" },
      { delayMs: 500, kind: "user_prompt", text: "rename App to KhApp" },
      {
        delayMs: 700,
        kind: "tool_use",
        toolName: "read_file_v2",
        input: { file_path: "src/renderer/src/App.tsx" },
      },
      { delayMs: 400, kind: "tool_result", output: "(file contents)" },
      {
        delayMs: 600,
        kind: "tool_use",
        toolName: "edit_file",
        input: { file_path: "src/renderer/src/App.tsx", change: "rename" },
      },
      { delayMs: 400, kind: "tool_result", output: "applied" },
      {
        delayMs: 800,
        kind: "tool_use",
        toolName: "run_terminal_command_v2",
        input: { command: "bun run typecheck" },
      },
      { delayMs: 1200, kind: "tool_result", output: "✓ typecheck passed" },
      {
        delayMs: 900,
        kind: "assistant_text",
        text: "Renamed `App` → `KhApp` in `src/renderer/src/App.tsx`, updated the export, and re-ran typecheck — clean.",
      },
      { delayMs: 500, kind: "session_end", text: "exit 0" },
    ],
  };
}

function codexShell(cwd: string): FakeUnit {
  return {
    sessionId: `codex-fixture-${randomUUID()}`,
    tool: "codex",
    cwd,
    events: [
      { delayMs: 100, kind: "session_start", text: "codex shell demo" },
      { delayMs: 400, kind: "user_prompt", text: "list TS files" },
      {
        delayMs: 600,
        kind: "tool_use",
        toolName: "shell",
        input: { command: "find src -name '*.ts' | wc -l" },
      },
      {
        delayMs: 700,
        kind: "tool_result",
        output: { exit_code: 0, stdout: "31\n" },
      },
      {
        delayMs: 800,
        kind: "assistant_text",
        text: "31 TypeScript files in `src/`.",
      },
      { delayMs: 500, kind: "session_end", text: "exit 0" },
    ],
  };
}

function scheduleCodexInputs(cwd: string) {
  const sessionId = `codex-inputs-${randomUUID()}`;
  const userInputRequestId = `fixture-user-input-${randomUUID()}`;
  const mcpRequestId = `fixture-mcp-elicitation-${randomUUID()}`;
  const timers: NodeJS.Timeout[] = [];
  const emit = (
    delayMs: number,
    kind: AgentEvent["kind"],
    payload: AgentEvent["payload"]
  ) => {
    timers.push(
      setTimeout(() => {
        bus.emitAgentEvent({
          sessionId,
          tool: "codex",
          cwd,
          timestamp: Date.now(),
          kind,
          payload,
          source: "spawned",
        });
      }, delayMs)
    );
  };

  emit(100, "session_start", {
    text: "codex answer-letter fixture",
  });
  emit(500, "user_input_request", {
    requestId: userInputRequestId,
    name: "UserInput",
    text: "Choose the fixture implementation style.",
    input: { itemId: "fixture-item", threadId: sessionId },
    questions: [
      {
        id: "approach",
        header: "Approach",
        question: "Which implementation style should Codex use?",
        required: true,
        options: [
          {
            label: "Small",
            value: "small",
            description: "Keep the change scoped to this fixture.",
          },
          {
            label: "Broad",
            value: "broad",
            description: "Include surrounding cleanup too.",
          },
        ],
      },
      {
        id: "note",
        header: "Note",
        question: "Optional note to pass back to Codex.",
        required: false,
      },
    ],
  });
  emit(900, "user_input_request", {
    requestId: mcpRequestId,
    name: "McpElicitation",
    text: "Choose repository metadata.",
    input: {
      serverName: "fixture-mcp",
      threadId: sessionId,
      mode: "form",
    },
    responseKind: "mcp-elicitation",
    questions: [
      {
        id: "repository",
        header: "Repository",
        question: "Which repository should the MCP server use?",
        required: true,
        options: [
          { label: "Realmkeeper", value: "rw-rts" },
          { label: "Scratch", value: "scratch" },
        ],
      },
      {
        id: "labels",
        header: "Labels",
        question: "Optional labels to attach.",
        required: false,
        multiSelect: true,
        options: [
          { label: "Provider", value: "provider" },
          { label: "UI", value: "ui" },
          { label: "Probe", value: "probe" },
        ],
      },
      {
        id: "notify",
        header: "Notify",
        question: "Notify watchers?",
        required: true,
        options: [
          { label: "Yes", value: "true" },
          { label: "No", value: "false" },
        ],
      },
    ],
  });

  timers.push(setTimeout(() => activeTimers.delete(sessionId), 10_000));
  activeTimers.set(sessionId, timers);
}

function scheduleClaudeQuestion(cwd: string) {
  const sessionId = `claude-question-${randomUUID()}`;
  const requestId = `fixture-claude-question-${randomUUID()}`;
  const timers: NodeJS.Timeout[] = [];
  const emit = (
    delayMs: number,
    kind: AgentEvent["kind"],
    payload: AgentEvent["payload"]
  ) => {
    timers.push(
      setTimeout(() => {
        bus.emitAgentEvent({
          sessionId,
          tool: "claude",
          cwd,
          timestamp: Date.now(),
          kind,
          payload,
          source: "spawned",
        });
      }, delayMs)
    );
  };

  emit(100, "session_start", {
    text: "claude AskUserQuestion fixture",
  });
  emit(450, "user_input_request", {
    requestId,
    name: "AskUserQuestion",
    text: "Which implementation style should Claude use?",
    input: {
      questions: [
        {
          question: "Which implementation style should Claude use?",
          options: [
            { label: "Small", description: "Make the narrowest change." },
            { label: "Broad", description: "Include surrounding cleanup." },
          ],
        },
        {
          question: "Which areas should Claude inspect?",
          allow_multiple: true,
          choices: ["tests", "docs", "renderer"],
        },
      ],
    },
    questions: [
      {
        id: "question-1",
        header: "Question 1",
        question: "Which implementation style should Claude use?",
        required: true,
        options: [
          {
            label: "Small",
            value: "Small",
            description: "Make the narrowest change.",
          },
          {
            label: "Broad",
            value: "Broad",
            description: "Include surrounding cleanup.",
          },
        ],
      },
      {
        id: "question-2",
        header: "Question 2",
        question: "Which areas should Claude inspect?",
        required: true,
        multiSelect: true,
        options: [
          { label: "tests", value: "tests" },
          { label: "docs", value: "docs" },
          { label: "renderer", value: "renderer" },
        ],
      },
    ],
  });

  timers.push(setTimeout(() => activeTimers.delete(sessionId), 10_000));
  activeTimers.set(sessionId, timers);
}

function geminiTurn(cwd: string): FakeUnit {
  return {
    sessionId: `gemini-fixture-${randomUUID()}`,
    tool: "gemini",
    cwd,
    events: [
      { delayMs: 120, kind: "session_start", text: "gemini demo turn" },
      {
        delayMs: 400,
        kind: "user_prompt",
        text: "inspect the repo and propose the smallest useful write",
      },
      {
        delayMs: 650,
        kind: "tool_use",
        toolName: "Grep",
        input: { pattern: "gemini", path: ".docs" },
      },
      {
        delayMs: 450,
        kind: "tool_result",
        output: ".docs/providers/gemini.md",
      },
      {
        delayMs: 700,
        kind: "tool_use",
        toolName: "Write",
        input: { file_path: "notes/gemini-provider-check.md" },
      },
      { delayMs: 450, kind: "tool_result", output: "created" },
      {
        delayMs: 850,
        kind: "assistant_text",
        text: "Gemini provider check complete: hook bridge, active spawn, and UI routing are wired. I wrote a short follow-up note.",
      },
      { delayMs: 500, kind: "session_end", text: "exit 0" },
    ],
  };
}

function subagentSummon(cwd: string): FakeUnit[] {
  const parentId = randomUUID();
  const childId = randomUUID();
  return [
    {
      sessionId: parentId,
      tool: "claude",
      cwd,
      events: [
        { delayMs: 100, kind: "session_start", text: "subagent demo" },
        {
          delayMs: 500,
          kind: "tool_use",
          toolName: "Task",
          input: { description: "research the repo" },
        },
        { delayMs: 6000, kind: "tool_result", output: "child finished" },
        {
          delayMs: 400,
          kind: "assistant_text",
          text: "Subagent reported back. Summarizing.",
        },
        { delayMs: 500, kind: "session_end", text: "exit 0" },
      ],
    },
    {
      sessionId: childId,
      tool: "claude",
      cwd,
      events: [
        {
          delayMs: 800,
          kind: "session_start",
          text: "child agent",
          parentSessionId: parentId,
        },
        {
          delayMs: 400,
          kind: "tool_use",
          toolName: "Glob",
          input: { pattern: "**/*.md" },
        },
        { delayMs: 500, kind: "tool_result", output: "0 files" },
        {
          delayMs: 600,
          kind: "tool_use",
          toolName: "Read",
          input: { file_path: "package.json" },
        },
        { delayMs: 400, kind: "tool_result", output: "..." },
        {
          delayMs: 700,
          kind: "assistant_text",
          text: "Surveyed the repo: no markdown docs, manifest is `realmkeeper`.",
        },
        { delayMs: 400, kind: "session_end", text: "exit 0" },
      ],
    },
  ];
}

function riftlingRaid(cwd: string): FakeUnit {
  // Stresses the combat layer: errors that summon Riftling, edits that
  // clear them, occasional follow-up errors so the world goes warning →
  // danger → cleared.
  return {
    sessionId: `combat-${randomUUID()}`,
    tool: "claude",
    cwd,
    events: [
      { delayMs: 200, kind: "session_start", text: "running tests..." },
      {
        delayMs: 800,
        kind: "tool_use",
        toolName: "Bash",
        input: { command: "bun test" },
      },
      { delayMs: 600, kind: "tool_result", output: "FAIL src/foo.test.ts" },
      { delayMs: 200, kind: "error", text: "1 test failed" },
      { delayMs: 1200, kind: "error", text: "type error in src/foo.ts" },
      { delayMs: 1500, kind: "error", text: "lint warnings" },
      {
        delayMs: 900,
        kind: "tool_use",
        toolName: "Read",
        input: { file_path: "src/foo.ts" },
      },
      { delayMs: 500, kind: "tool_result", output: "..." },
      {
        delayMs: 800,
        kind: "tool_use",
        toolName: "Edit",
        input: { file_path: "src/foo.ts" },
      },
      { delayMs: 500, kind: "tool_result", output: "applied" },
      {
        delayMs: 600,
        kind: "tool_use",
        toolName: "Edit",
        input: { file_path: "src/foo.ts" },
      },
      { delayMs: 500, kind: "tool_result", output: "applied" },
      { delayMs: 700, kind: "error", text: "still failing" },
      {
        delayMs: 1000,
        kind: "tool_use",
        toolName: "Bash",
        input: { command: "bun test" },
      },
      { delayMs: 900, kind: "tool_result", output: "PASS" },
      {
        delayMs: 600,
        kind: "tool_use",
        toolName: "Edit",
        input: { file_path: "src/foo.ts" },
      },
      { delayMs: 500, kind: "tool_result", output: "applied" },
      {
        delayMs: 700,
        kind: "assistant_text",
        text: "Tests pass. Riftling cleared.",
      },
      { delayMs: 400, kind: "session_end", text: "exit 0" },
    ],
  };
}

// Per-archetype summon. Synthesizes a /tmp cwd whose `(tool, repoRoot)` hash
// lands on the desired archetype, since archetype assignment is locked per
// wielder identity. Each summon lands in its own demo world tile.
const WIELDER_LABEL: Record<UnitRole, string> = {
  warden1: "vaelens-grove",
  warden2: "selenes-bower",
  warden3: "ryders-forge",
  warden4: "lyris-cove",
};

function findCwdForRole(target: UnitRole, tool: AgentTool): string {
  for (let i = 0; i < 1000; i++) {
    const candidate = `/tmp/${WIELDER_LABEL[target]}-${i}`;
    if (archetypeFor(tool, candidate) === target) return candidate;
  }
  throw new Error(`fixture: could not synthesize cwd for ${target}`);
}

function summonWielder(target: UnitRole): FakeUnit {
  const cwd = findCwdForRole(target, "claude");
  return {
    sessionId: `summon-${target}-${randomUUID()}`,
    tool: "claude",
    cwd,
    events: [
      { delayMs: 200, kind: "session_start", text: "awakening..." },
      {
        delayMs: 1200,
        kind: "tool_use",
        toolName: "Read",
        input: { file_path: "README.md" },
      },
      { delayMs: 900, kind: "tool_result", output: "(file contents)" },
      { delayMs: 1100, kind: "assistant_text", text: "Surveying the world." },
      {
        delayMs: 1400,
        kind: "tool_use",
        toolName: "Glob",
        input: { pattern: "**/*.ts" },
      },
      { delayMs: 800, kind: "tool_result", output: "ok" },
      { delayMs: 4000, kind: "session_end", text: "exit 0" },
    ],
  };
}

function summonAllWielders(): FakeUnit[] {
  return [
    summonWielder("warden1"),
    summonWielder("warden2"),
    summonWielder("warden3"),
    summonWielder("warden4"),
  ];
}

function stressBurst(cwd: string): FakeUnit {
  const events: ScriptedEvent[] = [
    { delayMs: 50, kind: "session_start", text: "stress test" },
  ];
  for (let i = 0; i < 30; i++) {
    events.push({
      delayMs: 60,
      kind: "tool_use",
      toolName: "Read",
      input: { file_path: `f${i}.ts` },
    });
    events.push({ delayMs: 30, kind: "tool_result", output: "ok" });
  }
  events.push({
    delayMs: 200,
    kind: "assistant_text",
    text: "Touched 30 files in a burst.",
  });
  events.push({ delayMs: 100, kind: "session_end", text: "exit 0" });
  return { sessionId: `stress-${randomUUID()}`, tool: "claude", cwd, events };
}

export type FixtureScenarioId =
  | "summon-vaelen"
  | "summon-selene"
  | "summon-ryder"
  | "summon-lyris"
  | "summon-all"
  | "cursor-turn"
  | "codex-shell"
  | "codex-inputs"
  | "claude-question"
  | "gemini-turn"
  | "subagent"
  | "stress"
  | "combat"
  | "permission"
  | "demo";

export function playFixture(scenario: FixtureScenarioId, cwd: string) {
  const c = resolve(cwd);
  console.log(`[fixture] play scenario=${scenario}`);
  switch (scenario) {
    case "summon-vaelen":
      schedule(summonWielder("warden1"));
      break;
    case "summon-selene":
      schedule(summonWielder("warden2"));
      break;
    case "summon-ryder":
      schedule(summonWielder("warden3"));
      break;
    case "summon-lyris":
      schedule(summonWielder("warden4"));
      break;
    case "summon-all":
      // Fire all four with small staggers so the worlds appear in sequence.
      summonAllWielders().forEach((u, i) =>
        setTimeout(() => schedule(u), i * 600)
      );
      break;
    case "cursor-turn":
      schedule(cursorTurn(c));
      break;
    case "codex-shell":
      schedule(codexShell(c));
      break;
    case "codex-inputs":
      scheduleCodexInputs(c);
      break;
    case "claude-question":
      scheduleClaudeQuestion(c);
      break;
    case "gemini-turn":
      schedule(geminiTurn(c));
      break;
    case "subagent":
      for (const u of subagentSummon(c)) schedule(u);
      break;
    case "stress":
      schedule(stressBurst(c));
      break;
    case "combat":
      schedule(riftlingRaid(c));
      break;
    case "permission":
      // UI-only test of the permission letter + IPC flow. No hook
      // socket to reply to, so resolvePermissionRequest will return
      // false in main — that's expected. Tests letter rendering +
      // store action wiring.
      {
        const sessionId = randomUUID();
        const requestId = randomUUID();
        bus.emitAgentEvent({
          sessionId,
          tool: "claude",
          cwd: c,
          timestamp: Date.now(),
          kind: "session_start",
          payload: {},
          source: "spawned",
        });
        setTimeout(() => {
          bus.emitAgentEvent({
            sessionId,
            tool: "claude",
            cwd: c,
            timestamp: Date.now(),
            kind: "permission_request",
            payload: {
              name: "Bash",
              input: { command: "rm -rf /tmp/dangerous-test-junk" },
              requestId,
            },
            source: "spawned",
          });
        }, 400);
      }
      break;
    case "demo":
      // Fire all providers in parallel for a "show me everything" demo.
      schedule(claudeStarter(c));
      setTimeout(() => schedule(cursorTurn(c)), 1500);
      setTimeout(() => schedule(codexShell(c)), 3000);
      setTimeout(() => schedule(geminiTurn(c)), 4500);
      break;
    default: {
      const exhaustive: never = scenario;
      console.warn(`[fixture] unknown scenario: ${exhaustive as string}`);
    }
  }
}

export function stopAllFixtures() {
  for (const timers of activeTimers.values()) {
    for (const t of timers) clearTimeout(t);
  }
  activeTimers.clear();
}
