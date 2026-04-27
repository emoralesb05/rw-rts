import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  IPC,
  type SpawnAgentRequest,
  type SendPromptRequest,
  type HooksStatus,
  type PlayFixtureRequest,
} from "../shared/ipc";
import type { AgentEvent } from "../shared/events";

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
  playFixture(req: PlayFixtureRequest) {
    return ipcRenderer.invoke(IPC.PlayFixture, req) as Promise<void>;
  },
};

contextBridge.exposeInMainWorld("kh", api);

export type KhApi = typeof api;
