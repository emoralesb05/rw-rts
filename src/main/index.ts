import { app, BrowserWindow, ipcMain, dialog, shell } from "electron";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { bus } from "./event-bus";
import { AgentManager } from "./agent-manager";
import {
  applyPermissionChoiceRequest,
  startHookBridge,
  stopHookBridge,
  resolvePermissionRequest,
} from "./adapters/hook-bridge";
import { resolveUserInputRequest } from "./adapters/user-input-bridge";
import { listPermissionRules, removePermissionRule } from "./permission-rules";
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
  HooksStatusSchema,
  KillAgentRequestSchema,
  ListUnitsResponseSchema,
  ListWorkspaceReposResponseSchema,
  OpenPathRequestSchema,
  OpenPathResponseSchema,
  PersistedStateSchema,
  PlayFixtureRequestSchema,
  ApplyPermissionChoiceRequestSchema,
  ApplyPermissionChoiceResponseSchema,
  ListPermissionRulesResponseSchema,
  RemovePermissionRuleRequestSchema,
  RemovePermissionRuleResponseSchema,
  ResolvePermissionResponseSchema,
  ResolvePermissionRequestSchema,
  ResolveUserInputRequestSchema,
  ResolveUserInputResponseSchema,
  SendPromptRequestSchema,
  SpawnAgentRequestSchema,
  SpawnAgentResponseSchema,
  VoidResponseSchema,
  WorkspaceRootValidationSchema,
  WorkspaceRootPathSchema,
} from "@shared/schemas";
import type { z } from "zod";
import {
  loadPersisted,
  setPersisted,
  resetPersisted,
  flushPersisted,
} from "./persistent-state";
import { parseIpcPayload, parseIpcResponse } from "./ipc-validation";

let mainWindow: BrowserWindow | null = null;
let runtimeStopped = false;
const isE2E = process.env.REALMKEEPER_E2E === "1";

if (isE2E && process.env.REALMKEEPER_USER_DATA) {
  app.setPath("userData", process.env.REALMKEEPER_USER_DATA);
}

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
  const appIconPath = join(app.getAppPath(), "build/icon.png");
  const iconPath = existsSync(appIconPath)
    ? appIconPath
    : join(process.cwd(), "build/icon.png");
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0a0e1a",
    titleBarStyle: "hiddenInset",
    title: "Realmkeeper",
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      sandbox: true,
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
    console.error("[realmkeeper] preload failed:", preloadPath, error);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(
      join(__dirname, "../renderer/index.html"),
      isE2E ? { query: { e2e: "1" } } : undefined
    );
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
function safeHandle<TArgs extends unknown[]>(
  channel: string,
  fn: (
    event: Electron.IpcMainInvokeEvent,
    ...args: TArgs
  ) => unknown | Promise<unknown>,
  responseSchema?: z.ZodType<unknown>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    const expected = mainWindow?.webContents;
    if (
      !expected ||
      event.sender !== expected ||
      event.senderFrame !== expected.mainFrame
    ) {
      throw new Error(
        `[realmkeeper] ipc rejected: untrusted sender for ${channel}`
      );
    }
    const result = await fn(event, ...(args as TArgs));
    if (!responseSchema) return result;
    return parseIpcResponse(channel, responseSchema, result);
  });
}

async function offerHookInstall() {
  if (isInstalled()) return;
  const result = await dialog.showMessageBox({
    type: "question",
    buttons: ["Install hooks", "Skip"],
    defaultId: 0,
    cancelId: 1,
    title: "Realmkeeper hook bridge",
    message:
      "Install Claude Code hooks so Realmkeeper can watch your other Claude sessions?",
    detail:
      "Adds entries to ~/.claude/settings.json that forward tool-call events to a local socket. " +
      "Uninstall any time from the Settings menu.",
  });
  if (result.response === 0) {
    installHooks();
  }
}

// Expose CDP for agent-browser attach in dev.
if (!app.isPackaged && !isE2E) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

void app.whenReady().then(async () => {
  // Refresh the user-dir copy of bin/realmkeeper-hook from the bundled
  // source. Runs every boot — keeps the installed script in sync with
  // the app version. Must run before hook installers (so they
  // reference a present, executable file) and before the bridge (so
  // any racing hook fire finds the script).
  if (!isE2E) {
    syncHookScript();
    startHookBridge();
    startClaudeTranscriptWatcher();
    startCodexTranscriptWatcher();
  }
  createWindow();

  process.on("SIGUSR1", () => {
    if (!mainWindow) return;
    void (async () => {
      try {
        const img = await mainWindow.webContents.capturePage();
        const path = "/tmp/realmkeeper-frame.png";
        await writeFile(path, img.toPNG());
        console.log(`[realmkeeper] frame captured → ${path}`);
      } catch (e) {
        console.error("[realmkeeper] capture failed:", e);
      }
    })();
  });

  if (!isE2E) await offerHookInstall();

  safeHandle(
    IPC.SpawnAgent,
    async (_e, raw: unknown) => {
      const req = parseIpcPayload(IPC.SpawnAgent, SpawnAgentRequestSchema, raw);
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
    },
    SpawnAgentResponseSchema
  );

  safeHandle(
    IPC.SendPrompt,
    (_e, raw: unknown) => {
      const req = parseIpcPayload(IPC.SendPrompt, SendPromptRequestSchema, raw);
      if (AgentManager.get(req.unitId)) {
        AgentManager.send(req.unitId, req.prompt);
        return;
      }
      if (!req.sessionId || !req.tool || !req.cwd) {
        throw new Error(`Unknown unit ${req.unitId}`);
      }
      AgentManager.sendToObserved(
        { sessionId: req.sessionId, tool: req.tool, cwd: req.cwd },
        req.prompt
      );
    },
    VoidResponseSchema
  );

  safeHandle(
    IPC.KillAgent,
    (_e, raw: unknown) => {
      const unitId = parseIpcPayload(
        IPC.KillAgent,
        KillAgentRequestSchema,
        raw
      );
      AgentManager.kill(unitId);
    },
    VoidResponseSchema
  );

  safeHandle(
    IPC.ListUnits,
    () =>
      AgentManager.list().map((a) => ({
        unitId: a.unitId,
        sessionId: a.sessionId,
        cwd: a.cwd,
      })),
    ListUnitsResponseSchema
  );

  safeHandle(
    IPC.InstallHooks,
    () => {
      installHooks();
      return getStatus();
    },
    HooksStatusSchema
  );
  safeHandle(
    IPC.UninstallHooks,
    () => {
      uninstallHooks();
      return getStatus();
    },
    HooksStatusSchema
  );
  safeHandle(IPC.HooksStatus, () => getStatus(), HooksStatusSchema);

  safeHandle(
    IPC.InstallCursorHooks,
    () => {
      installCursorHooks();
      return getCursorHooksStatus();
    },
    HooksStatusSchema
  );
  safeHandle(
    IPC.UninstallCursorHooks,
    () => {
      uninstallCursorHooks();
      return getCursorHooksStatus();
    },
    HooksStatusSchema
  );
  safeHandle(
    IPC.CursorHooksStatus,
    () => getCursorHooksStatus(),
    HooksStatusSchema
  );

  safeHandle(
    IPC.InstallCodexHooks,
    () => {
      installCodexHooks();
      return getCodexHooksStatus();
    },
    HooksStatusSchema
  );
  safeHandle(
    IPC.UninstallCodexHooks,
    () => {
      uninstallCodexHooks();
      return getCodexHooksStatus();
    },
    HooksStatusSchema
  );
  safeHandle(
    IPC.CodexHooksStatus,
    () => getCodexHooksStatus(),
    HooksStatusSchema
  );

  safeHandle(
    IPC.InstallGeminiHooks,
    () => {
      installGeminiHooks();
      return getGeminiHooksStatus();
    },
    HooksStatusSchema
  );
  safeHandle(
    IPC.UninstallGeminiHooks,
    () => {
      uninstallGeminiHooks();
      return getGeminiHooksStatus();
    },
    HooksStatusSchema
  );
  safeHandle(
    IPC.GeminiHooksStatus,
    () => getGeminiHooksStatus(),
    HooksStatusSchema
  );

  safeHandle(
    IPC.OpenPath,
    async (_e, raw: unknown) => {
      const req = parseIpcPayload(IPC.OpenPath, OpenPathRequestSchema, raw);
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
    },
    OpenPathResponseSchema
  );

  safeHandle(
    IPC.PlayFixture,
    (_e, raw: unknown) => {
      const req = parseIpcPayload(
        IPC.PlayFixture,
        PlayFixtureRequestSchema,
        raw
      );
      const cwd = resolve(req.cwd || ".");
      playFixture(req.scenario, cwd);
    },
    VoidResponseSchema
  );

  safeHandle(
    IPC.ResolvePermission,
    (_e, raw: unknown) => {
      const req = parseIpcPayload(
        IPC.ResolvePermission,
        ResolvePermissionRequestSchema,
        raw
      );
      return resolvePermissionRequest(
        req.requestId,
        req.decision,
        req.message,
        req.optionId
      );
    },
    ResolvePermissionResponseSchema
  );

  safeHandle(
    IPC.ApplyPermissionChoice,
    (_e, raw: unknown) => {
      const req = parseIpcPayload(
        IPC.ApplyPermissionChoice,
        ApplyPermissionChoiceRequestSchema,
        raw
      );
      return applyPermissionChoiceRequest(
        req.requestId,
        req.choiceId,
        req.message,
        req.optionId
      );
    },
    ApplyPermissionChoiceResponseSchema
  );

  safeHandle(
    IPC.ListPermissionRules,
    () => listPermissionRules(),
    ListPermissionRulesResponseSchema
  );

  safeHandle(
    IPC.RemovePermissionRule,
    (_e, raw: unknown) => {
      const req = parseIpcPayload(
        IPC.RemovePermissionRule,
        RemovePermissionRuleRequestSchema,
        raw
      );
      return removePermissionRule(req.ruleId);
    },
    RemovePermissionRuleResponseSchema
  );

  safeHandle(
    IPC.ResolveUserInput,
    (_e, raw: unknown) => {
      const req = parseIpcPayload(
        IPC.ResolveUserInput,
        ResolveUserInputRequestSchema,
        raw
      );
      return resolveUserInputRequest(req.requestId, req.answers, {
        responseKind: req.responseKind,
        responseAction: req.responseAction,
      });
    },
    ResolveUserInputResponseSchema
  );

  safeHandle(
    IPC.ListWorkspaceRepos,
    () => listWorkspaceRepos(),
    ListWorkspaceReposResponseSchema
  );
  safeHandle(IPC.GetSettings, () => loadSettings(), AppSettingsSchema);
  safeHandle(
    IPC.SaveSettings,
    (_e, raw: unknown) => {
      const next = parseIpcPayload(IPC.SaveSettings, AppSettingsSchema, raw);
      return saveSettings(next);
    },
    AppSettingsSchema
  );
  safeHandle(
    IPC.ValidateWorkspaceRoot,
    (_e, raw: unknown) => {
      const path = parseIpcPayload(
        IPC.ValidateWorkspaceRoot,
        WorkspaceRootPathSchema,
        raw
      );
      return validateWorkspaceRoot(path);
    },
    WorkspaceRootValidationSchema
  );

  safeHandle(IPC.LoadPersisted, () => loadPersisted(), PersistedStateSchema);
  safeHandle(
    IPC.SavePersisted,
    (_e, raw: unknown) => {
      const state = parseIpcPayload(
        IPC.SavePersisted,
        PersistedStateSchema,
        raw
      );
      setPersisted(state);
    },
    VoidResponseSchema
  );
  safeHandle(IPC.ResetPersisted, () => resetPersisted(), PersistedStateSchema);

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
