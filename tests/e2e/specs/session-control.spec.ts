import { expect, test } from "../fixtures/electron";
import { waitForRealmkeeper, type RwE2eWindow } from "../helpers/app";

test("fails closed for unsupported and stale session controls", async ({
  appPage: page,
}) => {
  await waitForRealmkeeper(page);

  const results = await page.evaluate(async () => {
    const rw = (window as unknown as RwE2eWindow).rw;
    const unsupported = await rw.controlSession({
      action: "fork",
      unitId: "e2e-control-unsupported",
      tool: "claude",
      status: "working",
    });
    const missingMetadata = await rw.controlSession({
      action: "send",
      unitId: "e2e-control-stale",
      tool: "cursor",
      prompt: "continue from stale observed session",
      status: "working",
    });
    const invalid = await rw.controlSession({
      action: "send",
      unitId: "e2e-control-invalid",
      sessionId: "e2e-control-invalid-session",
      tool: "codex",
      cwd: "/repo",
      prompt: "   ",
      status: "working",
    });
    return { unsupported, missingMetadata, invalid };
  });

  expect(results.unsupported).toMatchObject({
    action: "fork",
    ok: false,
    reasonCode: "capability_unavailable",
  });
  expect(results.missingMetadata).toMatchObject({
    action: "send",
    ok: false,
    reasonCode: "missing_session_metadata",
  });
  expect(results.invalid).toMatchObject({
    action: "send",
    ok: false,
    reasonCode: "invalid_request",
  });

  await page.waitForFunction(() => {
    const events =
      (window as unknown as RwE2eWindow).__rwStore?.getState().events ?? [];
    return (
      events.filter((event) => event.kind === "session_control").length >= 3
    );
  });

  const controlEvents = await page.evaluate(() => {
    const events =
      (window as unknown as RwE2eWindow).__rwStore?.getState().events ?? [];
    return events
      .filter((event) => event.kind === "session_control")
      .map((event) => ({
        sessionId: event.sessionId,
        action: event.payload.controlAction,
        ok: event.payload.ok,
        reasonCode: event.payload.reasonCode,
      }));
  });

  expect(controlEvents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        sessionId: "e2e-control-unsupported",
        action: "fork",
        ok: false,
        reasonCode: "capability_unavailable",
      }),
      expect.objectContaining({
        sessionId: "e2e-control-stale",
        action: "send",
        ok: false,
        reasonCode: "missing_session_metadata",
      }),
      expect.objectContaining({
        sessionId: "e2e-control-invalid-session",
        action: "send",
        ok: false,
        reasonCode: "invalid_request",
      }),
    ])
  );

  const activity = page.getByRole("log", { name: "Activity log" });
  await activity.getByRole("button", { name: /activity/i }).click();
  await expect(activity.getByText(/fork failed/i)).toBeVisible();
  await expect(
    activity.getByText(/send failed · Observed session metadata is missing/i)
  ).toBeVisible();
  await expect(
    activity.getByText(/send failed · Prompt is required/i)
  ).toBeVisible();
});
