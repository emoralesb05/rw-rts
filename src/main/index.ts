import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { join, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { bus } from "./event-bus";
import { AgentManager } from "./agent-manager";
import { startHookBridge, stopHookBridge } from "./adapters/claude-hook";
import { startCursorAdapter, stopCursorAdapter } from "./adapters/cursor";
import {
  installHooks,
  uninstallHooks,
  getStatus,
  isInstalled,
} from "./hook-installer";
import { IPC, type SpawnAgentRequest, type SendPromptRequest } from "@shared/ipc";

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0e1a",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  bus.onAgentEvent((event) => {
    mainWindow?.webContents.send(IPC.EventStream, event);
  });
}

async function offerHookInstall() {
  if (isInstalled()) return;
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Install hooks", "Skip"],
    defaultId: 0,
    cancelId: 1,
    title: "kh-rts hook bridge",
    message: "Install Claude Code hooks so this app can visualize your other Claude sessions?",
    detail:
      "Adds entries to ~/.claude/settings.json that forward tool-call events to a local socket. " +
      "Uninstall any time from the Settings menu.",
  });
  if (result.response === 0) {
    installHooks();
  }
}

// Expose CDP for agent-browser attach in dev.
if (!app.isPackaged) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

app.whenReady().then(async () => {
  startHookBridge();
  startCursorAdapter();
  createWindow();

  process.on("SIGUSR1", async () => {
    if (!mainWindow) return;
    try {
      const img = await mainWindow.webContents.capturePage();
      const path = "/tmp/kh-rts-frame.png";
      await writeFile(path, img.toPNG());
      console.log(`[kh-rts] frame captured → ${path}`);
    } catch (e) {
      console.error("[kh-rts] capture failed:", e);
    }
  });

  process.on("SIGUSR2", async () => {
    const cwd = resolve(".");
    AgentManager.spawn("claude", {
      prompt: "List the files in the current directory and tell me about them.",
      cwd,
    });
    AgentManager.spawn("claude", {
      prompt: "Search the web for the latest Claude Code release notes.",
      cwd,
    });
    AgentManager.spawn("claude", {
      prompt: "Read package.json and summarize the dependencies.",
      cwd,
    });
    console.log("[kh-rts] spawned 3 dev agents, will enter world in 4s");
    setTimeout(() => {
      mainWindow?.webContents.executeJavaScript(
        `(() => { const s = window.__khStore; if (!s) return false; const ws = s.getState().worlds; const ids = Object.keys(ws); if (!ids.length) return false; s.getState().selectWorld(ids[0]); return true; })()`
      );
    }, 4000);
  });

  await offerHookInstall();

  ipcMain.handle(IPC.SpawnAgent, async (_e, req: SpawnAgentRequest) => {
    const cwd = resolve(req.cwd || ".");
    const tool = req.tool === "cursor" ? "cursor" : "claude";
    const agent = AgentManager.spawn(tool, { prompt: req.prompt, cwd });
    return { unitId: agent.unitId, sessionId: agent.sessionId };
  });

  ipcMain.handle(IPC.SendPrompt, (_e, req: SendPromptRequest) => {
    AgentManager.send(req.unitId, req.prompt);
  });

  ipcMain.handle(IPC.KillAgent, (_e, unitId: string) => {
    AgentManager.kill(unitId);
  });

  ipcMain.handle(IPC.ListUnits, () =>
    AgentManager.list().map((a) => ({
      unitId: a.unitId,
      sessionId: a.sessionId,
      cwd: a.cwd,
    }))
  );

  ipcMain.handle(IPC.InstallHooks, () => {
    installHooks();
    return getStatus();
  });
  ipcMain.handle(IPC.UninstallHooks, () => {
    uninstallHooks();
    return getStatus();
  });
  ipcMain.handle(IPC.HooksStatus, () => getStatus());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  AgentManager.killAll();
  stopHookBridge();
  stopCursorAdapter();
  if (process.platform !== "darwin") app.quit();
});

app.on("will-quit", () => {
  AgentManager.killAll();
  stopHookBridge();
  stopCursorAdapter();
});
