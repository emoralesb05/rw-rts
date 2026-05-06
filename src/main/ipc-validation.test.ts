import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseIpcPayload, parseIpcResponse } from "./ipc-validation";

describe("main IPC validation helpers", () => {
  const Schema = z.object({
    id: z.string().min(1),
    nested: z.object({ ok: z.boolean() }),
  });

  it("returns parsed IPC payloads", () => {
    expect(
      parseIpcPayload("kh:test", Schema, {
        id: "one",
        nested: { ok: true },
      })
    ).toEqual({ id: "one", nested: { ok: true } });
  });

  it("labels invalid payload errors with channel and path", () => {
    expect(() =>
      parseIpcPayload("kh:test", Schema, {
        id: "",
        nested: { ok: true },
      })
    ).toThrow("[keykeeper] invalid kh:test payload: id:");
  });

  it("labels invalid response errors separately from payload errors", () => {
    expect(() =>
      parseIpcResponse("kh:test", Schema, {
        id: "one",
        nested: { ok: "yes" },
      })
    ).toThrow("[keykeeper] invalid kh:test response: nested.ok:");
  });
});
