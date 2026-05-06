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
  syncHookScript,
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
import {
  installGeminiHooks,
  uninstallGeminiHooks,
  getGeminiHooksStatus,
} from "./gemini-hook-installer";
import { listWorkspaceRepos } from "./workspace-scan";
import { loadSettings, saveSettings, validateWorkspaceRoot } from "./settings";
import { IPC } from "@shared/ipc";
import {
  AppSettingsSchema,
  OpenPathRequestSchema,
  PersistedStateSchema,
  PlayFixtureRequestSchema,
  ResolvePermissionRequestSchema,
  SendPromptRequestSchema,
  SpawnAgentRequestSchema,
  WorkspaceRootPathSchema,
} from "@shared/schemas";
import type { z } from "zod";
import {
  loadPersisted,
  setPersisted,
  resetPersisted,
  flushPersisted,
} from "./persistent-state";

let mainWindow: BrowserWindow | null = null;
let runtimeStopped = false;

function stopRuntimeServices() {
  if (runtimeStopped) return;
  runtimeStopped = true;
  AgentManager.killAll();
  stopHookBridge();
  stopClaudeTranscriptWatcher();
  stopCodexTranscriptWatcher();
  stopAllFixtures();
}

function createWindow() {
  // app.getAppPath() resolves to the repo root in dev and the .app's
  // Resources/app dir when packaged — both have build/icon.png at the
  // same relative location, so the lookup works in either mode.
  const iconPath = join(app.getAppPath(), "build/icon.png");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0e1a",
    titleBarStyle: "hiddenInset",
    title: "Keykeeper",
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // macOS dock icon: only needed in dev (packaged builds get it from
  // the .icns inside the bundle). app.dock is darwin-only — guard
  // both the platform and the optional chain.
  if (process.platform === "darwin" && !app.isPackaged && app.dock) {
    app.dock.setIcon(iconPath);
  }

  mainWindow.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("[keykeeper] preload failed:", preloadPath, error);
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
    // Hook events can arrive after the window has been closed but
    // before the bridge has shut down (window-close → will-quit
    // window). Guard against the destroyed-webContents case so the
    // user doesn't see an Uncaught Exception dialog on close.
    const wc = mainWindow?.webContents;
    if (!wc || wc.isDestroyed()) return;
    wc.send(IPC.EventStream, event);
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
    if (
      !expected ||
      event.sender !== expected ||
      event.senderFrame !== expected.mainFrame
    ) {
      throw new Error(
        `[keykeeper] ipc rejected: untrusted sender for ${channel}`
      );
    }
    return fn(event, ...(args as TArgs));
  });
}

function formatSchemaError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function parseIpc<T>(channel: string, schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `[keykeeper] invalid ${channel} payload: ${formatSchemaError(parsed.error)}`
    );
  }
  return parsed.data;
}

async function offerHookInstall() {
  if (isInstalled()) return;
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Install hooks", "Skip"],
    defaultId: 0,
    cancelId: 1,
    title: "keykeeper hook bridge",
    message:
      "Install Claude Code hooks so keykeeper can watch your other Claude sessions?",
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
  // Refresh the user-dir copy of bin/keykeeper-hook from the bundled
  // source. Runs every boot — keeps the installed script in sync with
  // the app version. Must run before hook installers (so they
  // reference a present, executable file) and before the bridge (so
  // any racing hook fire finds the script).
  syncHookScript();
  startHookBridge();
  startClaudeTranscriptWatcher();
  startCodexTranscriptWatcher();
  createWindow();

  process.on("SIGUSR1", async () => {
    if (!mainWindow) return;
    try {
      const img = await mainWindow.webContents.capturePage();
      const path = "/tmp/keykeeper-frame.png";
      await writeFile(path, img.toPNG());
      console.log(`[keykeeper] frame captured → ${path}`);
    } catch (e) {
      console.error("[keykeeper] capture failed:", e);
    }
  });

  await offerHookInstall();

  safeHandle(IPC.SpawnAgent, async (_e, raw: unknown) => {
    const req = parseIpc(IPC.SpawnAgent, SpawnAgentRequestSchema, raw);
    const cwd = resolve(req.cwd || ".");
    const tool: "claude" | "cursor" | "codex" | "gemini" =
      req.tool === "cursor"
        ? "cursor"
        : req.tool === "codex"
        ? "codex"
        : req.tool === "gemini"
        ? "gemini"
        : "claude";
    const agent = await AgentManager.spawn(tool, { prompt: req.prompt, cwd });
    return { unitId: agent.unitId, sessionId: agent.sessionId };
  });

  safeHandle(IPC.SendPrompt, (_e, raw: unknown) => {
    const req = parseIpc(IPC.SendPrompt, SendPromptRequestSchema, raw);
    AgentManager.send(req.unitId, req.prompt);
  });

  safeHandle(IPC.KillAgent, (_e, unitId: unknown) => {
    if (typeof unitId !== "string" || !unitId) {
      throw new Error(`[keykeeper] invalid ${IPC.KillAgent} payload`);
    }
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

  safeHandle(IPC.InstallGeminiHooks, () => {
    installGeminiHooks();
    return getGeminiHooksStatus();
  });
  safeHandle(IPC.UninstallGeminiHooks, () => {
    uninstallGeminiHooks();
    return getGeminiHooksStatus();
  });
  safeHandle(IPC.GeminiHooksStatus, () => getGeminiHooksStatus());

  safeHandle(
    IPC.OpenPath,
    async (
      _e,
      raw: unknown
    ) => {
      const req = parseIpc(IPC.OpenPath, OpenPathRequestSchema, raw);
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

  safeHandle(IPC.PlayFixture, (_e, raw: unknown) => {
    const req = parseIpc(IPC.PlayFixture, PlayFixtureRequestSchema, raw);
    const cwd = resolve(req.cwd || ".");
    playFixture(req.scenario, cwd);
  });

  safeHandle(IPC.ResolvePermission, (_e, raw: unknown) => {
    const req = parseIpc(
      IPC.ResolvePermission,
      ResolvePermissionRequestSchema,
      raw
    );
    return resolvePermissionRequest(req.requestId, req.decision, req.message);
  });

  safeHandle(IPC.ListWorkspaceRepos, () => listWorkspaceRepos());
  safeHandle(IPC.GetSettings, () => loadSettings());
  safeHandle(IPC.SaveSettings, (_e, raw: unknown) => {
    const next = parseIpc(IPC.SaveSettings, AppSettingsSchema, raw);
    return saveSettings(next);
  });
  safeHandle(IPC.ValidateWorkspaceRoot, (_e, raw: unknown) => {
    const path = parseIpc(IPC.ValidateWorkspaceRoot, WorkspaceRootPathSchema, raw);
    return validateWorkspaceRoot(path);
  });

  safeHandle(IPC.LoadPersisted, () => loadPersisted());
  safeHandle(IPC.SavePersisted, (_e, raw: unknown) => {
    const state = parseIpc(IPC.SavePersisted, PersistedStateSchema, raw);
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
    stopRuntimeServices();
    app.quit();
  }
});

app.on("will-quit", () => {
  stopRuntimeServices();
  flushPersisted();
});
