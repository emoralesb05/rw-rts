import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC,
  type SpawnAgentRequest,
  type SendPromptRequest,
  type HooksStatus,
  type PlayFixtureRequest,
  type ResolvePermissionRequest,
  type WorkspaceRepoEntry,
  type AppSettings,
  type WorkspaceRootValidation,
} from "../shared/ipc";
import type { AgentEvent, PersistedState } from "../shared/events";

const api = {
  onEvent(listener: (event: AgentEvent) => void) {
    const wrapped = (_e: IpcRendererEvent, ev: AgentEvent) => listener(ev);
    ipcRenderer.on(IPC.EventStream, wrapped);
    return () => ipcRenderer.off(IPC.EventStream, wrapped);
  },
  spawnAgent(req: SpawnAgentRequest) {
    return ipcRenderer.invoke(IPC.SpawnAgent, req) as Promise<{ unitId: string; sessionId: string }>;
  },
  sendPrompt(req: SendPromptRequest) {
    return ipcRenderer.invoke(IPC.SendPrompt, req) as Promise<void>;
  },
  killAgent(unitId: string) {
    return ipcRenderer.invoke(IPC.KillAgent, unitId) as Promise<void>;
  },
  listUnits() {
    return ipcRenderer.invoke(IPC.ListUnits) as Promise<
      { unitId: string; sessionId: string; cwd: string }[]
    >;
  },
  installHooks() {
    return ipcRenderer.invoke(IPC.InstallHooks) as Promise<HooksStatus>;
  },
  uninstallHooks() {
    return ipcRenderer.invoke(IPC.UninstallHooks) as Promise<HooksStatus>;
  },
  hooksStatus() {
    return ipcRenderer.invoke(IPC.HooksStatus) as Promise<HooksStatus>;
  },
  installCursorHooks() {
    return ipcRenderer.invoke(IPC.InstallCursorHooks) as Promise<HooksStatus>;
  },
  uninstallCursorHooks() {
    return ipcRenderer.invoke(IPC.UninstallCursorHooks) as Promise<HooksStatus>;
  },
  cursorHooksStatus() {
    return ipcRenderer.invoke(IPC.CursorHooksStatus) as Promise<HooksStatus>;
  },
  playFixture(req: PlayFixtureRequest) {
    return ipcRenderer.invoke(IPC.PlayFixture, req) as Promise<void>;
  },
  loadPersisted() {
    return ipcRenderer.invoke(IPC.LoadPersisted) as Promise<PersistedState>;
  },
  savePersisted(state: PersistedState) {
    return ipcRenderer.invoke(IPC.SavePersisted, state) as Promise<void>;
  },
  resetPersisted() {
    return ipcRenderer.invoke(IPC.ResetPersisted) as Promise<PersistedState>;
  },
  resolvePermission(req: ResolvePermissionRequest) {
    return ipcRenderer.invoke(IPC.ResolvePermission, req) as Promise<boolean>;
  },
  listWorkspaceRepos() {
    return ipcRenderer.invoke(IPC.ListWorkspaceRepos) as Promise<WorkspaceRepoEntry[]>;
  },
  getSettings() {
    return ipcRenderer.invoke(IPC.GetSettings) as Promise<AppSettings>;
  },
  saveSettings(next: AppSettings) {
    return ipcRenderer.invoke(IPC.SaveSettings, next) as Promise<AppSettings>;
  },
  validateWorkspaceRoot(p: string) {
    return ipcRenderer.invoke(IPC.ValidateWorkspaceRoot, p) as Promise<WorkspaceRootValidation>;
  },
};

contextBridge.exposeInMainWorld("kh", api);

export type KhApi = typeof api;
