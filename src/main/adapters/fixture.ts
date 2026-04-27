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
import type { AgentEvent, AgentTool } from "@shared/events";

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
      { delayMs: 600, kind: "tool_use", toolName: "Read", input: { file_path: `${cwd}/package.json` } },
      {
        delayMs: 700,
        kind: "tool_result",
        output: '{ "name": "kh-rts", "version": "0.0.1" }',
      },
      {
        delayMs: 900,
        kind: "assistant_text",
        text:
          "It's an Electron desktop app called **kh-rts**. Stack: Electron, Phaser 3, React 19, Streamdown.\n\nLet me check the source.",
      },
      { delayMs: 800, kind: "tool_use", toolName: "Glob", input: { pattern: "src/**/*.ts" } },
      { delayMs: 600, kind: "tool_result", output: "31 files" },
      {
        delayMs: 1100,
        kind: "assistant_text",
        text:
          "31 source files across `main/`, `renderer/`, `preload/`, `shared/`. Multi-tool agent visualizer. Want me to dig into a specific area?",
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
      { delayMs: 700, kind: "tool_use", toolName: "read_file_v2", input: { file_path: "src/renderer/src/App.tsx" } },
      { delayMs: 400, kind: "tool_result", output: "(file contents)" },
      { delayMs: 600, kind: "tool_use", toolName: "edit_file", input: { file_path: "src/renderer/src/App.tsx", change: "rename" } },
      { delayMs: 400, kind: "tool_result", output: "applied" },
      { delayMs: 800, kind: "tool_use", toolName: "run_terminal_command_v2", input: { command: "bun run typecheck" } },
      { delayMs: 1200, kind: "tool_result", output: "✓ typecheck passed" },
      {
        delayMs: 900,
        kind: "assistant_text",
        text:
          "Renamed `App` → `KhApp` in `src/renderer/src/App.tsx`, updated the export, and re-ran typecheck — clean.",
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
      { delayMs: 600, kind: "tool_use", toolName: "shell", input: { command: "find src -name '*.ts' | wc -l" } },
      { delayMs: 700, kind: "tool_result", output: { exit_code: 0, stdout: "31\n" } },
      {
        delayMs: 800,
        kind: "assistant_text",
        text: "31 TypeScript files in `src/`.",
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
        { delayMs: 500, kind: "tool_use", toolName: "Task", input: { description: "research the repo" } },
        { delayMs: 6000, kind: "tool_result", output: "child finished" },
        { delayMs: 400, kind: "assistant_text", text: "Subagent reported back. Summarizing." },
        { delayMs: 500, kind: "session_end", text: "exit 0" },
      ],
    },
    {
      sessionId: childId,
      tool: "claude",
      cwd,
      events: [
        { delayMs: 800, kind: "session_start", text: "child agent", parentSessionId: parentId },
        { delayMs: 400, kind: "tool_use", toolName: "Glob", input: { pattern: "**/*.md" } },
        { delayMs: 500, kind: "tool_result", output: "0 files" },
        { delayMs: 600, kind: "tool_use", toolName: "Read", input: { file_path: "package.json" } },
        { delayMs: 400, kind: "tool_result", output: "..." },
        { delayMs: 700, kind: "assistant_text", text: "Surveyed the repo: no markdown docs, manifest is kh-rts." },
        { delayMs: 400, kind: "session_end", text: "exit 0" },
      ],
    },
  ];
}

function heartlessRaid(cwd: string): FakeUnit {
  // Stresses the combat layer: errors that summon Heartless, edits that
  // clear them, occasional follow-up errors so the world goes warning →
  // danger → cleared.
  return {
    sessionId: `combat-${randomUUID()}`,
    tool: "claude",
    cwd,
    events: [
      { delayMs: 200, kind: "session_start", text: "running tests..." },
      { delayMs: 800, kind: "tool_use", toolName: "Bash", input: { command: "bun test" } },
      { delayMs: 600, kind: "tool_result", output: "FAIL src/foo.test.ts" },
      { delayMs: 200, kind: "error", text: "1 test failed" },
      { delayMs: 1200, kind: "error", text: "type error in src/foo.ts" },
      { delayMs: 1500, kind: "error", text: "lint warnings" },
      { delayMs: 900, kind: "tool_use", toolName: "Read", input: { file_path: "src/foo.ts" } },
      { delayMs: 500, kind: "tool_result", output: "..." },
      { delayMs: 800, kind: "tool_use", toolName: "Edit", input: { file_path: "src/foo.ts" } },
      { delayMs: 500, kind: "tool_result", output: "applied" },
      { delayMs: 600, kind: "tool_use", toolName: "Edit", input: { file_path: "src/foo.ts" } },
      { delayMs: 500, kind: "tool_result", output: "applied" },
      { delayMs: 700, kind: "error", text: "still failing" },
      { delayMs: 1000, kind: "tool_use", toolName: "Bash", input: { command: "bun test" } },
      { delayMs: 900, kind: "tool_result", output: "PASS" },
      { delayMs: 600, kind: "tool_use", toolName: "Edit", input: { file_path: "src/foo.ts" } },
      { delayMs: 500, kind: "tool_result", output: "applied" },
      {
        delayMs: 700,
        kind: "assistant_text",
        text: "Tests pass. Heartless cleared.",
      },
      { delayMs: 400, kind: "session_end", text: "exit 0" },
    ],
  };
}

function stressBurst(cwd: string): FakeUnit {
  const events: ScriptedEvent[] = [
    { delayMs: 50, kind: "session_start", text: "stress test" },
  ];
  for (let i = 0; i < 30; i++) {
    events.push({ delayMs: 60, kind: "tool_use", toolName: "Read", input: { file_path: `f${i}.ts` } });
    events.push({ delayMs: 30, kind: "tool_result", output: "ok" });
  }
  events.push({ delayMs: 200, kind: "assistant_text", text: "Touched 30 files in a burst." });
  events.push({ delayMs: 100, kind: "session_end", text: "exit 0" });
  return { sessionId: `stress-${randomUUID()}`, tool: "claude", cwd, events };
}

export type FixtureScenarioId =
  | "claude-starter"
  | "cursor-turn"
  | "codex-shell"
  | "subagent"
  | "stress"
  | "combat"
  | "demo";

export function playFixture(scenario: FixtureScenarioId, cwd: string) {
  const c = resolve(cwd);
  switch (scenario) {
    case "claude-starter":
      schedule(claudeStarter(c));
      break;
    case "cursor-turn":
      schedule(cursorTurn(c));
      break;
    case "codex-shell":
      schedule(codexShell(c));
      break;
    case "subagent":
      for (const u of subagentSummon(c)) schedule(u);
      break;
    case "stress":
      schedule(stressBurst(c));
      break;
    case "combat":
      schedule(heartlessRaid(c));
      break;
    case "demo":
      // Fire all three tools in parallel for a "show me everything" demo.
      schedule(claudeStarter(c));
      setTimeout(() => schedule(cursorTurn(c)), 1500);
      setTimeout(() => schedule(codexShell(c)), 3000);
      break;
  }
}

export function stopAllFixtures() {
  for (const timers of activeTimers.values()) {
    for (const t of timers) clearTimeout(t);
  }
  activeTimers.clear();
}
