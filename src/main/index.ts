import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join, resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { bus } from "./event-bus";
import { AgentManager } from "./agent-manager";
import {
  startHookBridge,
  stopHookBridge,
  resolvePermissionRequest,
} from "./adapters/hook-bridge";
import {
  startClaudeTranscriptWatcher,
  stopClaudeTranscriptWatcher,
} from "./adapters/claude-transcript";
import {
  startCodexTranscriptWatcher,
  stopCodexTranscriptWatcher,
} from "./adapters/codex-transcript";
import { playFixture, stopAllFixtures } from "./adapters/fixture";
import {
  installHooks,
  uninstallHooks,
  getStatus,
  isInstalled,
} from "./hook-installer";
import {
  installCursorHooks,
  uninstallCursorHooks,
  getCursorHooksStatus,
} from "./cursor-hook-installer";
import {
  installCodexHooks,
  uninstallCodexHooks,
  getCodexHooksStatus,
} from "./codex-hook-installer";
import { listWorkspaceRepos } from "./workspace-scan";
import { loadSettings, saveSettings, validateWorkspaceRoot } from "./settings";
import {
  IPC,
  type SpawnAgentRequest,
  type SendPromptRequest,
  type PlayFixtureRequest,
  type ResolvePermissionRequest,
  type AppSettings,
} from "@shared/ipc";
import type { PersistedState } from "@shared/events";
import {
  loadPersisted,
  setPersisted,
  resetPersisted,
  flushPersisted,
} from "./persistent-state";

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

  // Lock down navigation. The renderer should never leave its bundled
  // origin (file:// in prod, electron-vite dev URL in dev) — if a
  // rendering bug or malicious markdown tried to navigate, the
  // renderer has wide IPC powers (spawn agents, install hooks, modify
  // settings). Open external URLs in the OS browser instead.
  const allowedOrigin = process.env.ELECTRON_RENDERER_URL ?? "file://";
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(allowedOrigin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  bus.onAgentEvent((event) => {
    mainWindow?.webContents.send(IPC.EventStream, event);
  });
}

// Sender-frame guard for IPC handlers. Wrap the Electron handler so we
// only run our logic when the call originates from our main window's
// top-level frame — blocks injected iframes / cross-origin frames
// from reaching the high-impact APIs (spawn, install hooks, save
// settings, resolve permission).
function safeHandle<TArgs extends unknown[], TResult>(
  channel: string,
  fn: (event: Electron.IpcMainInvokeEvent, ...args: TArgs) => TResult
): void {
  ipcMain.handle(channel, (event, ...args) => {
    const expected = mainWindow?.webContents;
    if (!expected || event.sender !== expected || event.senderFrame !== expected.mainFrame) {
      throw new Error(`[kh-rts] ipc rejected: untrusted sender for ${channel}`);
    }
    return fn(event, ...(args as TArgs));
  });
}

async function offerHookInstall() {
  if (isInstalled()) return;
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Install hooks", "Skip"],
    defaultId: 0,
    cancelId: 1,
    title: "keykeeper hook bridge",
    message: "Install Claude Code hooks so keykeeper can watch your other Claude sessions?",
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
  startClaudeTranscriptWatcher();
  startCodexTranscriptWatcher();
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

  await offerHookInstall();

  safeHandle(IPC.SpawnAgent, async (_e, req: SpawnAgentRequest) => {
    const cwd = resolve(req.cwd || ".");
    const tool: "claude" | "cursor" | "codex" =
      req.tool === "cursor" ? "cursor" : req.tool === "codex" ? "codex" : "claude";
    const agent = await AgentManager.spawn(tool, { prompt: req.prompt, cwd });
    return { unitId: agent.unitId, sessionId: agent.sessionId };
  });

  safeHandle(IPC.SendPrompt, (_e, req: SendPromptRequest) => {
    AgentManager.send(req.unitId, req.prompt);
  });

  safeHandle(IPC.KillAgent, (_e, unitId: string) => {
    AgentManager.kill(unitId);
  });

  safeHandle(IPC.ListUnits, () =>
    AgentManager.list().map((a) => ({
      unitId: a.unitId,
      sessionId: a.sessionId,
      cwd: a.cwd,
    }))
  );

  safeHandle(IPC.InstallHooks, () => {
    installHooks();
    return getStatus();
  });
  safeHandle(IPC.UninstallHooks, () => {
    uninstallHooks();
    return getStatus();
  });
  safeHandle(IPC.HooksStatus, () => getStatus());

  safeHandle(IPC.InstallCursorHooks, () => {
    installCursorHooks();
    return getCursorHooksStatus();
  });
  safeHandle(IPC.UninstallCursorHooks, () => {
    uninstallCursorHooks();
    return getCursorHooksStatus();
  });
  safeHandle(IPC.CursorHooksStatus, () => getCursorHooksStatus());

  safeHandle(IPC.InstallCodexHooks, () => {
    installCodexHooks();
    return getCodexHooksStatus();
  });
  safeHandle(IPC.UninstallCodexHooks, () => {
    uninstallCodexHooks();
    return getCodexHooksStatus();
  });
  safeHandle(IPC.CodexHooksStatus, () => getCodexHooksStatus());

  safeHandle(
    IPC.OpenPath,
    async (_e, req: { path: string; tool?: "claude" | "cursor" | "codex" }) => {
      // Always try Cursor first regardless of which wielder generated
      // the path. The user works in Cursor; code files belong there.
      // If Cursor's URL handler isn't registered (Cursor not installed
      // or scheme stripped), fall through to the OS default app.
      const path = req?.path;
      if (typeof path !== "string" || !path.startsWith("/")) {
        return "invalid path";
      }
      try {
        await shell.openExternal(`cursor://file${path}`);
        return "";
      } catch {
        return await shell.openPath(path);
      }
    }
  );

  safeHandle(IPC.PlayFixture, (_e, req: PlayFixtureRequest) => {
    const cwd = resolve(req.cwd || ".");
    playFixture(req.scenario, cwd);
  });

  safeHandle(IPC.ResolvePermission, (_e, req: ResolvePermissionRequest) => {
    return resolvePermissionRequest(req.requestId, req.decision, req.message);
  });

  safeHandle(IPC.ListWorkspaceRepos, () => listWorkspaceRepos());
  safeHandle(IPC.GetSettings, () => loadSettings());
  safeHandle(IPC.SaveSettings, (_e, next: AppSettings) => saveSettings(next));
  safeHandle(IPC.ValidateWorkspaceRoot, (_e, p: string) =>
    validateWorkspaceRoot(p)
  );

  safeHandle(IPC.LoadPersisted, () => loadPersisted());
  safeHandle(IPC.SavePersisted, (_e, state: PersistedState) => {
    setPersisted(state);
  });
  safeHandle(IPC.ResetPersisted, () => resetPersisted());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS the app stays alive after the window closes (Cmd-Q is the
  // explicit quit). Don't tear down adapters here — the user may reopen
  // the window and expect everything to still be running. Cleanup is
  // handled in "will-quit", which is the only true shutdown signal.
  if (process.platform !== "darwin") {
    AgentManager.killAll();
    stopHookBridge();
    stopClaudeTranscriptWatcher();
    stopCodexTranscriptWatcher();
    stopAllFixtures();
    app.quit();
  }
});

app.on("will-quit", () => {
  AgentManager.killAll();
  stopHookBridge();
  stopAllFixtures();
  flushPersisted();
});
