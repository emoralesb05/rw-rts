#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const cwd = process.cwd();
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS ?? 180000);
const allowedCommandPattern = /printf\s+['"]?realmkeeper-live-probe['"]?/;

let nextId = 1;
let threadId;
let turnId;
let completed = false;
const pending = new Map();
const events = [];
const serverRequests = [];
const assistantMessages = [];
const commandResults = [];
const stderrLines = [];

const child = spawn("codex", ["app-server", "--stdio"], {
  cwd,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env },
});

const timeout = setTimeout(() => {
  finish("timeout").catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}, timeoutMs);

child.once("exit", (code, signal) => {
  if (!completed) {
    for (const { reject } of pending.values()) {
      reject(new Error(`codex app-server exited: code=${code} signal=${signal}`));
    }
    pending.clear();
  }
});

child.once("error", (error) => {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
});

createInterface({ input: child.stdout }).on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch {
    events.push({ type: "stdout-parse-error", line: trimmed });
    return;
  }
  events.push(msg);
  handleMessage(msg);
});

createInterface({ input: child.stderr }).on("line", (line) => {
  if (!line.trim()) return;
  stderrLines.push(line);
});

try {
  await request("initialize", {
    clientInfo: {
      name: "realmkeeper-live-probe",
      title: "Realmkeeper Live Probe",
      version: "0.0.0",
    },
    capabilities: { experimentalApi: true },
  });
  notify("initialized", {});

  const threadResult = await request("thread/start", {
    cwd,
    approvalPolicy: "untrusted",
    approvalsReviewer: "user",
    sandbox: "read-only",
    serviceName: "realmkeeper-live-probe",
    ephemeral: true,
  });
  threadId = threadResult?.thread?.id;
  if (!threadId) throw new Error("thread/start did not return thread.id");

  const turnResult = await request("turn/start", {
    threadId,
    cwd,
    approvalPolicy: "untrusted",
    input: [
      {
        type: "text",
        text:
          "This is a Realmkeeper integration probe. Run exactly one harmless shell command if you need a command: `printf realmkeeper-live-probe`. Do not read files, write files, or run any other command. If approval is denied, reply with one sentence that the probe was denied.",
        text_elements: [],
      },
    ],
  });
  turnId = turnResult?.turn?.id ?? turnResult?.turnId;

  await waitForCompletion();
  await finish("completed");
} catch (error) {
  await finish("error", error);
}

function write(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function notify(method, params) {
  write({ method, params });
}

function request(method, params) {
  const id = nextId++;
  write({ id, method, params });
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
}

function handleMessage(msg) {
  if (Object.hasOwn(msg, "id") && !msg.method) {
    const pendingRequest = pending.get(msg.id);
    if (!pendingRequest) return;
    pending.delete(msg.id);
    if (msg.error) {
      pendingRequest.reject(new Error(JSON.stringify(msg.error)));
    } else {
      pendingRequest.resolve(msg.result);
    }
    return;
  }

  if (msg.method && Object.hasOwn(msg, "id")) {
    handleServerRequest(msg);
    return;
  }

  if (msg.method) handleNotification(msg);
}

function handleServerRequest(msg) {
  const method = msg.method;
  const params = msg.params ?? {};
  const response = failClosedResponse(method);

  if (method === "item/commandExecution/requestApproval") {
    const command = typeof params.command === "string" ? params.command : "";
    response.decision = allowedCommandPattern.test(command)
      ? "accept"
      : "decline";
  }

  serverRequests.push({
    id: msg.id,
    method,
    params,
    response,
  });
  write({ id: msg.id, result: response });
}

function handleNotification(msg) {
  if (msg.method === "turn/started") {
    turnId = msg.params?.turn?.id ?? turnId;
    return;
  }

  if (msg.method === "item/completed") {
    const item = msg.params?.item;
    if (item?.type === "agentMessage" && typeof item.text === "string") {
      assistantMessages.push(item.text);
    }
    if (item?.type === "commandExecution") {
      commandResults.push({
        command: item.command,
        exitCode: item.exitCode,
        output: item.aggregatedOutput,
      });
    }
    return;
  }

  if (msg.method === "turn/completed") {
    completed = true;
  }
}

function failClosedResponse(method) {
  if (method === "item/commandExecution/requestApproval") {
    return { decision: "decline" };
  }
  if (method === "item/fileChange/requestApproval") {
    return { decision: "decline" };
  }
  if (method === "item/permissions/requestApproval") {
    return { permissions: {}, scope: "turn", strictAutoReview: true };
  }
  if (method === "mcpServer/elicitation/request") {
    return { action: "decline", content: null, _meta: null };
  }
  if (method === "item/tool/requestUserInput") {
    return { answers: {} };
  }
  if (method === "item/tool/call") {
    return { contentItems: [], success: false };
  }
  if (method === "applyPatchApproval" || method === "execCommandApproval") {
    return { decision: "denied" };
  }
  return {};
}

function waitForCompletion() {
  return new Promise((resolve) => {
    const interval = setInterval(() => {
      if (completed) {
        clearInterval(interval);
        resolve();
      }
    }, 250);
  });
}

async function finish(status, error) {
  clearTimeout(timeout);
  if (threadId && turnId && !completed) {
    try {
      await request("turn/interrupt", { threadId, turnId });
    } catch {
      // The probe is already ending; interruption is best effort.
    }
  }
  child.kill("SIGTERM");

  const commandApprovals = serverRequests.filter(
    (request) => request.method === "item/commandExecution/requestApproval"
  );
  const acceptedCommands = commandApprovals.filter(
    (request) => request.response?.decision === "accept"
  );
  const summary = {
    status,
    error: error ? String(error.message ?? error) : undefined,
    cwd,
    threadId,
    turnId,
    serverRequestCount: serverRequests.length,
    commandApprovalCount: commandApprovals.length,
    acceptedCommandApprovalCount: acceptedCommands.length,
    commandApprovals,
    commandResults,
    assistantMessages,
    stderrLines: stderrLines.filter(
      (line) => !/could not create PATH aliases/.test(line)
    ),
  };

  console.log(JSON.stringify(summary, null, 2));
  if (error || status === "timeout") process.exitCode = 1;
}
