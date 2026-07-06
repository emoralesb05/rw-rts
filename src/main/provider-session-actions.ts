import { execFile } from "node:child_process";

export type ClaudeProviderSessionAction = "attach" | "logs";

export type ExecFileResult = {
  stdout: string;
  stderr: string;
};

export type ExecFileRunner = (
  file: string,
  args: string[],
  options: {
    cwd?: string;
    maxBuffer?: number;
    timeout?: number;
  }
) => Promise<ExecFileResult>;

const DEFAULT_TIMEOUT_MS = 8_000;
const LOGS_MAX_BUFFER = 512_000;

export function buildClaudeProviderSessionArgs(
  action: ClaudeProviderSessionAction,
  sessionId: string
): string[] {
  assertCommandValue("session id", sessionId);
  return [action, sessionId];
}

export function buildClaudeAttachCommand(args: {
  cwd: string;
  sessionId: string;
}): string {
  assertCommandValue("working directory", args.cwd);
  assertCommandValue("session id", args.sessionId);
  return `cd ${shellQuote(args.cwd)} && claude attach ${shellQuote(args.sessionId)}`;
}

export function buildClaudeAttachAppleScriptArgs(args: {
  cwd: string;
  sessionId: string;
}): string[] {
  const command = buildClaudeAttachCommand(args);
  return [
    "-e",
    `tell application "Terminal" to do script ${appleScriptString(command)}`,
    "-e",
    'tell application "Terminal" to activate',
  ];
}

export async function runClaudeProviderSessionAction(
  opts: {
    action: ClaudeProviderSessionAction;
    cwd: string;
    platform?: NodeJS.Platform;
    sessionId: string;
  },
  runner: ExecFileRunner = execFileRunner
): Promise<{ output?: string }> {
  if (opts.action === "logs") {
    const result = await runner(
      "claude",
      buildClaudeProviderSessionArgs("logs", opts.sessionId),
      {
        cwd: opts.cwd,
        maxBuffer: LOGS_MAX_BUFFER,
        timeout: DEFAULT_TIMEOUT_MS,
      }
    );
    return { output: compactOutput(result.stdout, result.stderr) };
  }

  if ((opts.platform ?? process.platform) !== "darwin") {
    throw new Error("Claude attach requires Terminal support on macOS.");
  }

  await runner(
    "osascript",
    buildClaudeAttachAppleScriptArgs({
      cwd: opts.cwd,
      sessionId: opts.sessionId,
    }),
    { timeout: DEFAULT_TIMEOUT_MS }
  );
  return { output: "Opened Claude attach in Terminal." };
}

function execFileRunner(
  file: string,
  args: string[],
  options: {
    cwd?: string;
    maxBuffer?: number;
    timeout?: number;
  }
): Promise<ExecFileResult> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      { ...options, encoding: "utf8" },
      (err, stdout, stderr) => {
        if (err) {
          reject(providerActionError(err, stdout, stderr));
          return;
        }
        resolve({ stdout, stderr });
      }
    );
  });
}

function compactOutput(stdout: string, stderr: string): string | undefined {
  const output = [stdout, stderr]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join("\n");
  return output || undefined;
}

function providerActionError(
  err: Error,
  stdout: string,
  stderr: string
): Error {
  const output = compactOutput(stdout, stderr);
  if (!output) return err;
  return new Error(output);
}

function assertCommandValue(label: string, value: string): void {
  if (!value) throw new Error(`Claude ${label} is required.`);
  if (/[\0\r\n]/.test(value)) {
    throw new Error(`Claude ${label} cannot contain control characters.`);
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
