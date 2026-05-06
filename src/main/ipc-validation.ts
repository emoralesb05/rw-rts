import type { z } from "zod";

export function formatSchemaError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export function parseIpcPayload<T>(
  channel: string,
  schema: z.ZodType<T>,
  value: unknown
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `[keykeeper] invalid ${channel} payload: ${formatSchemaError(parsed.error)}`
    );
  }
  return parsed.data;
}

export function parseIpcResponse<T>(
  channel: string,
  schema: z.ZodType<T>,
  value: unknown
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `[keykeeper] invalid ${channel} response: ${formatSchemaError(parsed.error)}`
    );
  }
  return parsed.data;
}
