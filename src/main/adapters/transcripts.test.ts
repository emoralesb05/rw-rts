import { describe, expect, it } from "vitest";
import { parseClaudeAssistantTranscriptLine } from "./claude-transcript";
import {
  parseCodexTranscriptLine,
  threadIdFromFilename,
} from "./codex-transcript";

describe("Claude transcript parsing", () => {
  it("extracts assistant text blocks", () => {
    const parsed = parseClaudeAssistantTranscriptLine(
      JSON.stringify({
        type: "assistant",
        uuid: "u1",
        timestamp: "2026-05-06T15:00:00.000Z",
        message: {
          content: [
            { type: "text", text: "hello" },
            { type: "tool_use", name: "Read" },
            { type: "text", text: "world" },
          ],
        },
      })
    );

    expect(parsed).toMatchObject({
      id: "u1",
      text: "hello\n\nworld",
      timestamp: Date.parse("2026-05-06T15:00:00.000Z"),
    });
  });

  it("ignores non-assistant lines", () => {
    expect(
      parseClaudeAssistantTranscriptLine(JSON.stringify({ type: "user" }))
    ).toBeNull();
  });
});

describe("Codex transcript parsing", () => {
  it("extracts thread id from rollout filenames", () => {
    expect(
      threadIdFromFilename(
        "/x/rollout-2026-04-26T17-15-03-019dcc4a-2230-7953-b4fc-4f2eb06b0d49.jsonl"
      )
    ).toBe("019dcc4a-2230-7953-b4fc-4f2eb06b0d49");
  });

  it("captures cwd from session metadata", () => {
    expect(
      parseCodexTranscriptLine(
        JSON.stringify({ type: "session_meta", payload: { cwd: "/repo" } })
      )
    ).toEqual({ type: "cwd", cwd: "/repo" });
  });

  it("extracts old-format agent messages", () => {
    expect(
      parseCodexTranscriptLine(
        JSON.stringify({
          type: "item.completed",
          item: { id: "i1", type: "agent_message", text: "answer" },
        })
      )
    ).toEqual({ type: "assistant_text", id: "i1", text: "answer" });
  });

  it("extracts final-answer response items", () => {
    expect(
      parseCodexTranscriptLine(
        JSON.stringify({
          type: "response_item",
          payload: {
            type: "message",
            role: "assistant",
            phase: "final_answer",
            content: [
              { type: "output_text", text: "part 1" },
              { type: "reasoning", text: "hidden" },
              { type: "output_text", text: "part 2" },
            ],
          },
        })
      )
    ).toEqual({
      type: "assistant_text",
      id: "t:part 1\n\npart 2:14",
      text: "part 1\n\npart 2",
    });
  });
});
