import { describe, expect, it } from "vitest";
import { normalizeHerdrAgentList } from "./herdr-source";

describe("Herdr monitor source", () => {
  it("normalizes metadata without terminal titles or content", () => {
    const observations = normalizeHerdrAgentList(
      {
        result: {
          agents: [
            {
              agent: "codex",
              agent_session: { value: "thread-1" },
              agent_status: "blocked",
              cwd: "/repo",
              pane_id: "w7:p1",
              revision: 3,
              state_change_seq: 10,
              terminal_title_stripped: "SENTINEL_PRIVATE_TITLE",
            },
          ],
        },
      },
      1_000
    );

    expect(observations[0]).toMatchObject({
      observationId: "herdr:w7:p1",
      providerId: "codex",
      nativeSessionId: "thread-1",
      state: "blocked",
      attentionKind: "stuck",
      herdrPaneId: "w7:p1",
      displayName: undefined,
    });
    expect(JSON.stringify(observations)).not.toContain(
      "SENTINEL_PRIVATE_TITLE"
    );
  });

  it("labels agents that cannot be reconciled to a native session", () => {
    const observations = normalizeHerdrAgentList(
      {
        result: {
          agents: [
            {
              agent: "claude",
              agent_status: "working",
              pane_id: "w2:p4",
            },
          ],
        },
      },
      1_000
    );

    expect(observations[0]?.displayName).toBe("Claude · w2:p4");
  });

  it("rejects undocumented lifecycle states", () => {
    expect(() =>
      normalizeHerdrAgentList(
        {
          result: {
            agents: [
              {
                agent: "codex",
                agent_status: "maybe-working",
                pane_id: "w1:p1",
              },
            ],
          },
        },
        1
      )
    ).toThrow();
  });
});
