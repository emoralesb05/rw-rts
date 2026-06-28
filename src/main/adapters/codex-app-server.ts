import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { bus } from "../event-bus";
import {
  cancelPermissionRequest,
  registerPermissionRequest,
} from "./hook-bridge";
import {
  cancelUserInputRequest,
  registerUserInputRequest,
} from "./user-input-bridge";
import { registerSpawnedSession, unregisterSpawnedSession } from "./claude-cli";
import type { AgentEvent, AgentEventSource } from "@shared/events";
import { permissionOptionsForTool } from "@shared/provider-permissions";
import type {
  PermissionDecision,
  UserInputAnswers,
  UserInputQuestion,
} from "@shared/schemas";

export type CodexAppServerAgent = {
  unitId: string;
  sessionId: string;
  cwd: string;
  proc: ChildProcess;
  send(prompt: string): void;
  kill(): void;
};

export type JsonRpcId = number | string;
type JsonRecord = Record<string, unknown>;
type PendingRequest = {
  resolve(value: unknown): void;
  reject(err: Error): void;
};

export function textInput(text: string): JsonRecord {
  return { type: "text", text, text_elements: [] };
}

export function buildThreadStartParams(cwd: string): JsonRecord {
  return {
    cwd,
    approvalPolicy: "never",
    sandbox: "workspace-write",
    serviceName: "realmkeeper",
  };
}

export function buildThreadResumeParams(
  threadId: string,
  cwd: string
): JsonRecord {
  return {
    threadId,
    cwd,
    approvalPolicy: "never",
    sandbox: "workspace-write",
  };
}

export function buildTurnStartParams(
  threadId: string,
  cwd: string,
  prompt: string
): JsonRecord {
  return {
    threadId,
    cwd,
    approvalPolicy: "never",
    input: [textInput(prompt)],
  };
}

export function buildTurnSteerParams(
  threadId: string,
  turnId: string,
  prompt: string
): JsonRecord {
  return {
    threadId,
    expectedTurnId: turnId,
    input: [textInput(prompt)],
  };
}

export function buildCodexAppServerArgs(): string[] {
  return ["app-server", "--stdio"];
}

export async function spawnCodexAppServerAgent(opts: {
  prompt: string;
  cwd: string;
}): Promise<CodexAppServerAgent> {
  const client = new CodexAppServerClient(opts.cwd);
  let threadResult: unknown;
  try {
    await client.initialize();
    threadResult = await client.request(
      "thread/start",
      buildThreadStartParams(opts.cwd)
    );
  } catch (err) {
    client.kill();
    throw err;
  }
  const thread = record(record(threadResult)?.thread);
  const threadId = stringValue(thread?.id);
  const sessionId = threadId ?? stringValue(thread?.sessionId);
  if (!sessionId || !threadId) {
    client.kill();
    throw new Error("codex app-server did not return a thread id");
  }

  registerSpawnedSession(sessionId);
  client.bindSession(sessionId, opts.cwd, threadId);

  bus.emitAgentEvent({
    sessionId,
    tool: "codex",
    cwd: opts.cwd,
    timestamp: Date.now(),
    kind: "session_start",
    payload: { text: opts.prompt },
    source: "spawned",
  });

  try {
    await client.startTurn(opts.prompt);
  } catch (err) {
    unregisterSpawnedSession(sessionId);
    client.kill();
    throw err;
  }

  const agent: CodexAppServerAgent = {
    unitId: sessionId,
    sessionId,
    cwd: opts.cwd,
    proc: client.proc,
    send(prompt: string) {
      bus.emitAgentEvent({
        sessionId,
        tool: "codex",
        cwd: opts.cwd,
        timestamp: Date.now(),
        kind: "user_prompt",
        payload: { text: prompt },
        source: "spawned",
      });
      void client.sendPrompt(prompt).catch((err: unknown) => {
        bus.emitAgentEvent({
          sessionId,
          tool: "codex",
          cwd: opts.cwd,
          timestamp: Date.now(),
          kind: "error",
          payload: { error: errorMessage(err) },
          source: "spawned",
        });
      });
    },
    kill() {
      void client.interruptActiveTurn().finally(() => client.kill());
    },
  };

  client.proc.on("exit", () => unregisterSpawnedSession(sessionId));
  client.proc.on("error", () => unregisterSpawnedSession(sessionId));

  return agent;
}

export function resumeCodexAppServerSession(opts: {
  sessionId: string;
  cwd: string;
  prompt: string;
}): ChildProcess {
  const client = new CodexAppServerClient(opts.cwd, "realmkeeper", true);
  registerSpawnedSession(opts.sessionId);
  client.bindSession(opts.sessionId, opts.cwd);

  bus.emitAgentEvent({
    sessionId: opts.sessionId,
    tool: "codex",
    cwd: opts.cwd,
    timestamp: Date.now(),
    kind: "user_prompt",
    payload: { text: opts.prompt },
    source: "realmkeeper",
  });

  void (async () => {
    await client.initialize();
    await client.resumeThread(opts.sessionId);
    await client.startTurn(opts.prompt);
  })().catch((err: unknown) => {
    bus.emitAgentEvent({
      sessionId: opts.sessionId,
      tool: "codex",
      cwd: opts.cwd,
      timestamp: Date.now(),
      kind: "error",
      payload: { error: errorMessage(err) },
      source: "realmkeeper",
    });
    unregisterSpawnedSession(opts.sessionId);
    client.kill();
  });

  client.proc.on("exit", () => unregisterSpawnedSession(opts.sessionId));
  client.proc.on("error", () => unregisterSpawnedSession(opts.sessionId));
  return client.proc;
}

class CodexAppServerClient {
  readonly proc: ChildProcess;
  private nextId = 1;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private sessionId: string | undefined;
  private cwd: string;
  private threadId: string | undefined;
  private activeTurnId: string | undefined;
  private readonly source: AgentEventSource;
  private readonly closeOnTurnCompleted: boolean;
  private readonly pendingPermissionRequests = new Set<string>();
  private readonly pendingUserInputRequests = new Set<string>();

  constructor(
    cwd: string,
    source: AgentEventSource = "spawned",
    closeOnTurnCompleted = false
  ) {
    this.cwd = cwd;
    this.source = source;
    this.closeOnTurnCompleted = closeOnTurnCompleted;
    this.proc = spawn("codex", buildCodexAppServerArgs(), {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    if (this.proc.stdout) {
      const lines = createInterface({ input: this.proc.stdout });
      lines.on("line", (line) => this.handleLine(line));
    }

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      if (
        /^\s*$/.test(text) ||
        /could not create PATH aliases/.test(text) ||
        /failed to record rollout items/.test(text)
      ) {
        return;
      }
      if (!this.sessionId) return;
      bus.emitAgentEvent({
        sessionId: this.sessionId,
        tool: "codex",
        cwd: this.cwd,
        timestamp: Date.now(),
        kind: "error",
        payload: { error: text },
        source: this.source,
      });
    });

    this.proc.once("exit", () => {
      this.rejectPending(new Error("codex app-server exited"));
    });
    this.proc.once("error", (err) => {
      this.rejectPending(err);
    });
  }

  bindSession(sessionId: string, cwd: string, threadId = sessionId) {
    this.sessionId = sessionId;
    this.cwd = cwd;
    this.threadId = threadId;
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: {
        name: "realmkeeper",
        title: "Realmkeeper",
        version: "0.7.0",
      },
      capabilities: { experimentalApi: true },
    });
    this.notify("initialized", {});
  }

  async startTurn(prompt: string) {
    if (!this.threadId) throw new Error("codex app-server thread missing");
    const result = await this.request(
      "turn/start",
      buildTurnStartParams(this.threadId, this.cwd, prompt)
    );
    const turn = record(record(result)?.turn);
    const turnId = stringValue(turn?.id);
    if (turnId) this.activeTurnId = turnId;
  }

  async resumeThread(threadId: string) {
    const result = await this.request(
      "thread/resume",
      buildThreadResumeParams(threadId, this.cwd)
    );
    const thread = record(record(result)?.thread);
    this.threadId = stringValue(thread?.id) ?? threadId;
  }

  async sendPrompt(prompt: string) {
    if (this.threadId && this.activeTurnId) {
      const result = await this.request(
        "turn/steer",
        buildTurnSteerParams(this.threadId, this.activeTurnId, prompt)
      );
      const turnId = stringValue(record(result)?.turnId);
      if (turnId) this.activeTurnId = turnId;
      return;
    }
    await this.startTurn(prompt);
  }

  async interruptActiveTurn() {
    if (!this.threadId || !this.activeTurnId) return;
    await this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId: this.activeTurnId,
    });
    this.activeTurnId = undefined;
  }

  request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.write({ method, id, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  notify(method: string, params: unknown) {
    this.write({ method, params });
  }

  kill() {
    this.proc.kill("SIGTERM");
  }

  private write(message: JsonRecord) {
    this.proc.stdin?.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: JsonRecord;
    try {
      msg = JSON.parse(trimmed) as JsonRecord;
    } catch {
      return;
    }

    if ("id" in msg && !msg.method) {
      this.handleResponse(msg);
      return;
    }
    if (msg.method && "id" in msg) {
      this.handleServerRequest(msg);
      return;
    }
    if (msg.method) {
      this.handleNotification(msg);
    }
  }

  private handleResponse(msg: JsonRecord) {
    const id = msg.id as JsonRpcId | undefined;
    if (id === undefined) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    if (msg.error) {
      pending.reject(new Error(errorMessage(msg.error)));
      return;
    }
    pending.resolve(msg.result);
  }

  private handleServerRequest(msg: JsonRecord) {
    const id = msg.id as JsonRpcId | undefined;
    const method = stringValue(msg.method);
    if (id === undefined || !method) return;
    if (!this.sessionId) {
      this.write({ id, result: codexAppServerFailClosedResponse(method) });
      return;
    }

    const event = buildCodexAppServerPermissionEvent({
      id,
      method,
      params: msg.params,
      sessionId: this.sessionId,
      cwd: this.cwd,
      source: this.source,
    });
    const requestId = event?.payload.requestId;
    if (event && requestId) {
      this.handlePermissionServerRequest(id, method, msg.params, event);
      return;
    }

    const userInputEvent = buildCodexAppServerUserInputEvent({
      id,
      method,
      params: msg.params,
      sessionId: this.sessionId,
      cwd: this.cwd,
      source: this.source,
    });
    const userInputRequestId = userInputEvent?.payload.requestId;
    if (userInputEvent && userInputRequestId) {
      this.handleUserInputServerRequest(id, method, msg.params, userInputEvent);
      return;
    }

    const mcpElicitationEvent = buildCodexAppServerMcpElicitationEvent({
      id,
      method,
      params: msg.params,
      sessionId: this.sessionId,
      cwd: this.cwd,
      source: this.source,
    });
    const mcpElicitationRequestId = mcpElicitationEvent?.payload.requestId;
    if (mcpElicitationEvent && mcpElicitationRequestId) {
      this.handleUserInputServerRequest(
        id,
        method,
        msg.params,
        mcpElicitationEvent
      );
      return;
    }

    this.write({ id, result: codexAppServerFailClosedResponse(method) });
    bus.emitAgentEvent({
      sessionId: this.sessionId,
      tool: "codex",
      cwd: this.cwd,
      timestamp: Date.now(),
      kind: "error",
      payload: {
        error: codexAppServerUnsupportedRequestError(method),
      },
      source: this.source,
    });
  }

  private handlePermissionServerRequest(
    id: JsonRpcId,
    method: string,
    params: unknown,
    event: AgentEvent
  ) {
    if (!this.sessionId) return;
    const requestId = event.payload.requestId;
    if (!requestId) {
      this.write({ id, result: codexAppServerFailClosedResponse(method) });
      bus.emitAgentEvent({
        sessionId: this.sessionId,
        tool: "codex",
        cwd: this.cwd,
        timestamp: Date.now(),
        kind: "error",
        payload: {
          error: codexAppServerUnsupportedRequestError(method),
        },
        source: this.source,
      });
      return;
    }

    const registered = registerPermissionRequest(
      {
        sessionId: this.sessionId,
        cwd: this.cwd,
        tool: "codex",
        source: this.source,
      },
      requestId,
      permissionOptionsForTool("codex"),
      ({ decision }) => {
        this.pendingPermissionRequests.delete(requestId);
        this.write({
          id,
          result: codexAppServerPermissionResponse(method, params, decision),
        });
      }
    );
    if (!registered) {
      this.write({ id, result: codexAppServerFailClosedResponse(method) });
      bus.emitAgentEvent({
        sessionId: this.sessionId,
        tool: "codex",
        cwd: this.cwd,
        timestamp: Date.now(),
        kind: "error",
        payload: {
          error: `Codex app-server request ${method} reused pending permission id ${requestId}`,
        },
        source: this.source,
      });
      return;
    }

    this.pendingPermissionRequests.add(requestId);
    bus.emitAgentEvent(event);
  }

  private handleUserInputServerRequest(
    id: JsonRpcId,
    method: string,
    params: unknown,
    event: AgentEvent
  ) {
    if (!this.sessionId) return;
    const requestId = event.payload.requestId;
    if (!requestId) {
      this.write({ id, result: codexAppServerFailClosedResponse(method) });
      return;
    }

    const registered = registerUserInputRequest(
      {
        sessionId: this.sessionId,
        cwd: this.cwd,
        tool: "codex",
        source: this.source,
      },
      requestId,
      ({ answers, responseAction, responseKind }) => {
        this.pendingUserInputRequests.delete(requestId);
        this.write({
          id,
          result:
            method === "mcpServer/elicitation/request" ||
            responseKind === "mcp-elicitation"
              ? codexAppServerMcpElicitationResponse(
                  params,
                  answers,
                  responseAction
                )
              : codexAppServerUserInputResponse(answers),
        });
      }
    );
    if (!registered) {
      this.write({ id, result: codexAppServerFailClosedResponse(method) });
      bus.emitAgentEvent({
        sessionId: this.sessionId,
        tool: "codex",
        cwd: this.cwd,
        timestamp: Date.now(),
        kind: "error",
        payload: {
          error: `Codex app-server request ${method} reused pending user input id ${requestId}`,
        },
        source: this.source,
      });
      return;
    }

    this.pendingUserInputRequests.add(requestId);
    bus.emitAgentEvent(event);
  }

  private handleNotification(msg: JsonRecord) {
    if (!this.sessionId) return;
    const method = stringValue(msg.method);
    if (method === "turn/started") {
      const turn = record(record(msg.params)?.turn);
      const turnId = stringValue(turn?.id);
      if (turnId) this.activeTurnId = turnId;
    } else if (method === "turn/completed") {
      this.activeTurnId = undefined;
    }
    const events = normalizeCodexAppServerNotification(
      msg,
      this.sessionId,
      this.cwd,
      this.source
    );
    for (const event of events) bus.emitAgentEvent(event);
    if (method === "turn/completed" && this.closeOnTurnCompleted) {
      setImmediate(() => this.kill());
    }
  }

  private rejectPending(err: Error) {
    for (const pending of this.pending.values()) pending.reject(err);
    this.pending.clear();
    for (const requestId of this.pendingPermissionRequests) {
      cancelPermissionRequest(requestId);
    }
    this.pendingPermissionRequests.clear();
    for (const requestId of this.pendingUserInputRequests) {
      cancelUserInputRequest(requestId);
    }
    this.pendingUserInputRequests.clear();
  }
}

export function buildCodexAppServerPermissionEvent(args: {
  id: JsonRpcId;
  method: string;
  params: unknown;
  sessionId: string;
  cwd: string;
  source?: AgentEventSource;
}): AgentEvent | null {
  const payload = codexApprovalPayload(args.method, args.params);
  if (!payload) return null;
  return {
    sessionId: args.sessionId,
    tool: "codex",
    cwd: args.cwd,
    source: args.source ?? "spawned",
    timestamp: Date.now(),
    kind: "permission_request",
    payload: {
      ...payload,
      requestId: codexAppServerRequestId(args.sessionId, args.id),
      permissionMode: "actionable",
      permissionOptions: permissionOptionsForTool("codex"),
    },
  };
}

export function buildCodexAppServerUserInputEvent(args: {
  id: JsonRpcId;
  method: string;
  params: unknown;
  sessionId: string;
  cwd: string;
  source?: AgentEventSource;
}): AgentEvent | null {
  if (args.method !== "item/tool/requestUserInput") return null;
  const p = record(args.params) ?? {};
  const questions = parseUserInputQuestions(p.questions);
  if (!questions.length) return null;
  return {
    sessionId: args.sessionId,
    tool: "codex",
    cwd: args.cwd,
    source: args.source ?? "spawned",
    timestamp: Date.now(),
    kind: "user_input_request",
    payload: {
      requestId: codexAppServerRequestId(args.sessionId, args.id),
      name: "UserInput",
      text: questions[0]?.question,
      input: compactRecord({
        itemId: stringValue(p.itemId),
        threadId: stringValue(p.threadId),
        turnId: stringValue(p.turnId),
        autoResolutionMs: nullableNumberValue(p.autoResolutionMs),
      }),
      questions,
      autoResolutionMs: nullableNumberValue(p.autoResolutionMs),
    },
  };
}

export function buildCodexAppServerMcpElicitationEvent(args: {
  id: JsonRpcId;
  method: string;
  params: unknown;
  sessionId: string;
  cwd: string;
  source?: AgentEventSource;
}): AgentEvent | null {
  if (args.method !== "mcpServer/elicitation/request") return null;
  const p = record(args.params) ?? {};
  if (p.mode !== "form") return null;
  const questions = parseMcpElicitationQuestions(p.requestedSchema);
  if (!questions.length) return null;
  const message = stringValue(p.message) ?? "MCP server needs input.";
  return {
    sessionId: args.sessionId,
    tool: "codex",
    cwd: args.cwd,
    source: args.source ?? "spawned",
    timestamp: Date.now(),
    kind: "user_input_request",
    payload: {
      requestId: codexAppServerRequestId(args.sessionId, args.id),
      name: "McpElicitation",
      text: message,
      input: compactRecord({
        serverName: stringValue(p.serverName),
        threadId: stringValue(p.threadId),
        turnId: nullableStringValue(p.turnId),
        mode: stringValue(p.mode),
        message,
      }),
      questions,
      responseKind: "mcp-elicitation",
    },
  };
}

export function normalizeCodexAppServerNotification(
  msg: JsonRecord,
  sessionId: string,
  cwd: string,
  source: AgentEventSource = "spawned"
): AgentEvent[] {
  const method = stringValue(msg.method);
  const params = record(msg.params);
  const out: AgentEvent[] = [];
  const ts = Date.now();
  const base = {
    sessionId,
    tool: "codex" as const,
    cwd,
    source,
  };

  if (method === "item/agentMessage/delta") {
    return out;
  }

  if (method === "item/completed") {
    const item = record(params?.item);
    const itemType = stringValue(item?.type);
    if (itemType === "agentMessage") {
      const text = stringValue(item?.text);
      if (text) {
        out.push({
          ...base,
          timestamp: ts,
          kind: "assistant_text",
          payload: { text },
        });
      }
    } else if (itemType === "commandExecution") {
      const command = stringValue(item?.command) ?? "";
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: { name: "Bash", input: { command } },
      });
      out.push({
        ...base,
        timestamp: ts + 1,
        kind: "tool_result",
        payload: {
          output: item?.aggregatedOutput ?? item?.exitCode,
          durationMs: numberValue(item?.durationMs),
        },
      });
    } else if (itemType === "fileChange") {
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: { name: "Edit", input: { changes: item?.changes } },
      });
    } else if (itemType === "mcpToolCall" || itemType === "dynamicToolCall") {
      const name = [stringValue(item?.server), stringValue(item?.tool)]
        .filter(Boolean)
        .join(".");
      out.push({
        ...base,
        timestamp: ts,
        kind: "tool_use",
        payload: {
          name: name || itemType,
          input: item?.arguments,
        },
      });
      out.push({
        ...base,
        timestamp: ts + 1,
        kind: "tool_result",
        payload: {
          output: item?.result ?? item?.contentItems ?? item?.error,
          durationMs: numberValue(item?.durationMs),
        },
      });
    }
    return out;
  }

  if (method === "turn/completed") {
    const turn = record(params?.turn);
    out.push({
      ...base,
      timestamp: ts,
      kind: "session_end",
      payload: { text: stringValue(turn?.status) ?? "completed" },
    });
  } else if (method === "error") {
    out.push({
      ...base,
      timestamp: ts,
      kind: "error",
      payload: { error: errorMessage(params) },
    });
  }

  return out;
}

export function codexAppServerFailClosedResponse(method: string): JsonRecord {
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

export function codexAppServerUnsupportedRequestError(method: string): string {
  return `Codex app-server request ${method} was declined by Realmkeeper's adapter`;
}

export function codexAppServerPermissionResponse(
  method: string,
  params: unknown,
  decision: PermissionDecision
): JsonRecord {
  if (
    method === "item/commandExecution/requestApproval" ||
    method === "item/fileChange/requestApproval"
  ) {
    return { decision: decision === "allow" ? "accept" : "decline" };
  }
  if (method === "item/permissions/requestApproval") {
    if (decision === "allow") {
      return {
        permissions: grantedPermissionsFromRequest(record(params)?.permissions),
        scope: "turn",
      };
    }
    return { permissions: {}, scope: "turn", strictAutoReview: true };
  }
  if (method === "applyPatchApproval" || method === "execCommandApproval") {
    return { decision: decision === "allow" ? "approved" : "denied" };
  }
  return codexAppServerFailClosedResponse(method);
}

export function codexAppServerUserInputResponse(
  answers: UserInputAnswers
): JsonRecord {
  return { answers };
}

export function codexAppServerMcpElicitationResponse(
  params: unknown,
  answers: UserInputAnswers,
  action: "accept" | "decline" | "cancel" = "accept"
): JsonRecord {
  if (action !== "accept") {
    return { action, content: null, _meta: null };
  }
  return {
    action: "accept",
    content: mcpElicitationContentFromAnswers(params, answers),
    _meta: null,
  };
}

function codexApprovalPayload(
  method: string,
  params: unknown
): Pick<AgentEvent["payload"], "name" | "input"> | null {
  const p = record(params) ?? {};
  if (method === "item/commandExecution/requestApproval") {
    return {
      name: "Bash",
      input: compactRecord({
        command: stringValue(p.command),
        cwd: stringValue(p.cwd),
        reason: nullableStringValue(p.reason),
        commandActions: p.commandActions,
        networkApprovalContext: p.networkApprovalContext,
        proposedExecpolicyAmendment: p.proposedExecpolicyAmendment,
        proposedNetworkPolicyAmendments: p.proposedNetworkPolicyAmendments,
      }),
    };
  }
  if (method === "execCommandApproval") {
    return {
      name: "Bash",
      input: compactRecord({
        command: commandDisplayValue(p.command),
        cwd: stringValue(p.cwd),
        reason: nullableStringValue(p.reason),
        parsedCmd: p.parsedCmd,
      }),
    };
  }
  if (method === "item/fileChange/requestApproval") {
    return {
      name: "Edit",
      input: compactRecord({
        itemId: stringValue(p.itemId),
        reason: nullableStringValue(p.reason),
        grantRoot: nullableStringValue(p.grantRoot),
      }),
    };
  }
  if (method === "applyPatchApproval") {
    return {
      name: "Edit",
      input: compactRecord({
        callId: stringValue(p.callId),
        fileChanges: p.fileChanges,
        reason: nullableStringValue(p.reason),
        grantRoot: nullableStringValue(p.grantRoot),
      }),
    };
  }
  if (method === "item/permissions/requestApproval") {
    return {
      name: "RequestPermissions",
      input: compactRecord({
        cwd: stringValue(p.cwd),
        reason: nullableStringValue(p.reason),
        permissions: p.permissions,
      }),
    };
  }
  return null;
}

function codexAppServerRequestId(sessionId: string, id: JsonRpcId): string {
  return `codex-app-server:${sessionId}:${String(id)}`;
}

function parseUserInputQuestions(value: unknown): UserInputQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const q = record(entry);
    const id = stringValue(q?.id);
    const header = stringValue(q?.header);
    const question = stringValue(q?.question);
    if (!id || !header || !question) return [];
    const options = Array.isArray(q?.options)
      ? q.options.flatMap((option) => {
          const o = record(option);
          const label = stringValue(o?.label);
          if (!label) return [];
          const description = stringValue(o?.description);
          return [
            description === undefined ? { label } : { label, description },
          ];
        })
      : undefined;
    return [
      {
        id,
        header,
        question,
        isOther: booleanValue(q?.isOther) || undefined,
        isSecret: booleanValue(q?.isSecret) || undefined,
        options,
      },
    ];
  });
}

function parseMcpElicitationQuestions(value: unknown): UserInputQuestion[] {
  const schema = record(value);
  const properties = record(schema?.properties);
  if (schema?.type !== "object" || !properties) return [];
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (entry): entry is string => typeof entry === "string"
        )
      : []
  );
  return Object.entries(properties).flatMap(([id, raw]) => {
    const field = record(raw);
    if (!field) return [];
    const title = stringValue(field.title) ?? id;
    const description =
      nullableStringValue(field.description) ?? `Provide ${title}.`;
    const options = mcpElicitationOptions(field);
    return [
      {
        id,
        header: title,
        question: description,
        required: required.has(id),
        multiSelect: field.type === "array" || undefined,
        options,
      },
    ];
  });
}

function mcpElicitationOptions(
  field: JsonRecord
): UserInputQuestion["options"] {
  const titledSingle = Array.isArray(field.oneOf)
    ? optionsFromConstList(field.oneOf)
    : [];
  if (titledSingle.length) return titledSingle;

  if (Array.isArray(field.enum)) {
    const names = Array.isArray(field.enumNames) ? field.enumNames : [];
    return field.enum.flatMap((entry, index) => {
      if (typeof entry !== "string") return [];
      const label =
        typeof names[index] === "string" && names[index] ? names[index] : entry;
      return [{ label, value: entry }];
    });
  }

  const items = record(field.items);
  const anyOf = Array.isArray(items?.anyOf)
    ? optionsFromConstList(items.anyOf)
    : [];
  if (anyOf.length) return anyOf;

  if (Array.isArray(items?.enum)) {
    return items.enum.flatMap((entry) =>
      typeof entry === "string" ? [{ label: entry, value: entry }] : []
    );
  }

  if (field.type === "boolean") {
    return [
      { label: "Yes", value: "true" },
      { label: "No", value: "false" },
    ];
  }

  return undefined;
}

function optionsFromConstList(
  value: unknown[]
): NonNullable<UserInputQuestion["options"]> {
  return value.flatMap((entry) => {
    const option = record(entry);
    const constValue = stringValue(option?.const);
    const title = stringValue(option?.title);
    if (!constValue || !title) return [];
    return [{ label: title, value: constValue }];
  });
}

function mcpElicitationContentFromAnswers(
  params: unknown,
  answers: UserInputAnswers
): JsonRecord {
  const schema = record(record(params)?.requestedSchema);
  const properties = record(schema?.properties);
  if (!properties) return {};
  const content: JsonRecord = {};
  for (const [id, raw] of Object.entries(properties)) {
    const field = record(raw);
    if (!field) continue;
    const values = answers[id]?.answers ?? [];
    if (!values.length) continue;
    const value = coerceMcpElicitationAnswer(field, values);
    if (value !== undefined) content[id] = value;
  }
  return content;
}

function coerceMcpElicitationAnswer(
  field: JsonRecord,
  values: string[]
): unknown {
  if (field.type === "array") return values;
  const value = values[0];
  if (value === undefined) return undefined;
  if (field.type === "boolean") return value === "true";
  if (field.type === "integer") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : undefined;
  }
  if (field.type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return value;
}

function grantedPermissionsFromRequest(value: unknown): JsonRecord {
  const permissions = record(value);
  if (!permissions) return {};
  const granted: JsonRecord = {};
  if (permissions.network !== null && permissions.network !== undefined) {
    granted.network = permissions.network;
  }
  if (permissions.fileSystem !== null && permissions.fileSystem !== undefined) {
    granted.fileSystem = permissions.fileSystem;
  }
  return granted;
}

function compactRecord(value: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined)
  );
}

function commandDisplayValue(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const parts = value.filter(
      (part): part is string => typeof part === "string"
    );
    return parts.length ? parts.join(" ") : undefined;
  }
  return stringValue(value);
}

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function nullableStringValue(value: unknown): string | undefined {
  return value === null ? undefined : stringValue(value);
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function nullableNumberValue(value: unknown): number | null | undefined {
  if (value === null) return null;
  return numberValue(value);
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return String(err);
}
