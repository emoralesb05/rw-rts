import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { z } from "zod";
import { IPC } from "../shared/ipc";
import {
  AgentEventSchema,
  AppSettingsSchema,
  ApplyPermissionChoiceResponseSchema,
  HooksStatusSchema,
  ListPermissionRulesResponseSchema,
  ListUnitsResponseSchema,
  ListWorkspaceReposResponseSchema,
  OpenPathResponseSchema,
  PersistedStateSchema,
  RemovePermissionRuleResponseSchema,
  ResolvePermissionResponseSchema,
  ResolveUserInputResponseSchema,
  SpawnAgentResponseSchema,
  VoidResponseSchema,
  WorkspaceRootValidationSchema,
  type ApplyPermissionChoiceRequest,
  type AppSettings,
  type SpawnAgentRequest,
  type SendPromptRequest,
  type PlayFixtureRequest,
  type ResolvePermissionRequest,
  type ResolveUserInputRequest,
} from "../shared/schemas";
import type { AgentEvent, PersistedState } from "../shared/events";

function formatSchemaIssues(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseIpcResponse<T>(
  channel: string,
  schema: z.ZodType<T>,
  value: unknown
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `[realmkeeper] invalid ${channel} response: ${formatSchemaIssues(parsed.error)}`
    );
  }
  return parsed.data;
}

async function invokeParsed<T>(
  channel: string,
  schema: z.ZodType<T>,
  ...args: unknown[]
): Promise<T> {
  const value = await ipcRenderer.invoke(channel, ...args);
  return parseIpcResponse(channel, schema, value);
}

const api = {
  onEvent(listener: (event: AgentEvent) => void) {
    const wrapped = (_e: IpcRendererEvent, ev: unknown) => {
      const parsed = AgentEventSchema.safeParse(ev);
      if (parsed.success) {
        listener(parsed.data);
        return;
      }
      console.warn(
        `[realmkeeper] dropped invalid ${IPC.EventStream} payload: ${formatSchemaIssues(parsed.error)}`
      );
    };
    ipcRenderer.on(IPC.EventStream, wrapped);
    return () => ipcRenderer.off(IPC.EventStream, wrapped);
  },
  spawnAgent(req: SpawnAgentRequest) {
    return invokeParsed(IPC.SpawnAgent, SpawnAgentResponseSchema, req);
  },
  sendPrompt(req: SendPromptRequest) {
    return invokeParsed(IPC.SendPrompt, VoidResponseSchema, req);
  },
  killAgent(unitId: string) {
    return invokeParsed(IPC.KillAgent, VoidResponseSchema, unitId);
  },
  listUnits() {
    return invokeParsed(IPC.ListUnits, ListUnitsResponseSchema);
  },
  installHooks() {
    return invokeParsed(IPC.InstallHooks, HooksStatusSchema);
  },
  uninstallHooks() {
    return invokeParsed(IPC.UninstallHooks, HooksStatusSchema);
  },
  hooksStatus() {
    return invokeParsed(IPC.HooksStatus, HooksStatusSchema);
  },
  installCursorHooks() {
    return invokeParsed(IPC.InstallCursorHooks, HooksStatusSchema);
  },
  uninstallCursorHooks() {
    return invokeParsed(IPC.UninstallCursorHooks, HooksStatusSchema);
  },
  cursorHooksStatus() {
    return invokeParsed(IPC.CursorHooksStatus, HooksStatusSchema);
  },
  installCodexHooks() {
    return invokeParsed(IPC.InstallCodexHooks, HooksStatusSchema);
  },
  uninstallCodexHooks() {
    return invokeParsed(IPC.UninstallCodexHooks, HooksStatusSchema);
  },
  codexHooksStatus() {
    return invokeParsed(IPC.CodexHooksStatus, HooksStatusSchema);
  },
  installGeminiHooks() {
    return invokeParsed(IPC.InstallGeminiHooks, HooksStatusSchema);
  },
  uninstallGeminiHooks() {
    return invokeParsed(IPC.UninstallGeminiHooks, HooksStatusSchema);
  },
  geminiHooksStatus() {
    return invokeParsed(IPC.GeminiHooksStatus, HooksStatusSchema);
  },
  playFixture(req: PlayFixtureRequest) {
    return invokeParsed(IPC.PlayFixture, VoidResponseSchema, req);
  },
  openPath(
    path: string,
    opts?: { tool?: "claude" | "cursor" | "codex" | "gemini" }
  ) {
    return invokeParsed(IPC.OpenPath, OpenPathResponseSchema, {
      path,
      tool: opts?.tool,
    });
  },
  loadPersisted() {
    return invokeParsed(IPC.LoadPersisted, PersistedStateSchema);
  },
  savePersisted(state: PersistedState) {
    return invokeParsed(IPC.SavePersisted, VoidResponseSchema, state);
  },
  resetPersisted() {
    return invokeParsed(IPC.ResetPersisted, PersistedStateSchema);
  },
  resolvePermission(req: ResolvePermissionRequest) {
    return invokeParsed(
      IPC.ResolvePermission,
      ResolvePermissionResponseSchema,
      req
    );
  },
  applyPermissionChoice(req: ApplyPermissionChoiceRequest) {
    return invokeParsed(
      IPC.ApplyPermissionChoice,
      ApplyPermissionChoiceResponseSchema,
      req
    );
  },
  listPermissionRules() {
    return invokeParsed(
      IPC.ListPermissionRules,
      ListPermissionRulesResponseSchema
    );
  },
  removePermissionRule(ruleId: string) {
    return invokeParsed(
      IPC.RemovePermissionRule,
      RemovePermissionRuleResponseSchema,
      { ruleId }
    );
  },
  resolveUserInput(req: ResolveUserInputRequest) {
    return invokeParsed(
      IPC.ResolveUserInput,
      ResolveUserInputResponseSchema,
      req
    );
  },
  listWorkspaceRepos() {
    return invokeParsed(
      IPC.ListWorkspaceRepos,
      ListWorkspaceReposResponseSchema
    );
  },
  getSettings() {
    return invokeParsed(IPC.GetSettings, AppSettingsSchema);
  },
  saveSettings(next: AppSettings) {
    return invokeParsed(IPC.SaveSettings, AppSettingsSchema, next);
  },
  validateWorkspaceRoot(p: string) {
    return invokeParsed(
      IPC.ValidateWorkspaceRoot,
      WorkspaceRootValidationSchema,
      p
    );
  },
};

contextBridge.exposeInMainWorld("rw", api);

export type RwApi = typeof api;
