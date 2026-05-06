/**
 * Dispatch dialog — opens from the WielderHUD's "+ dispatch" button.
 * Roomy spawn surface so the King can compose a real prompt with all
 * context (tool, target world, multi-line directive) before kicking
 * off a wielder. Replaces the old bottom-strip spawn role.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { usePanels } from "./panel-store";
import type { WorkspaceRepoEntry } from "@shared/schemas";

type Tool = "claude" | "cursor" | "codex" | "gemini";
const TOOLS: Tool[] = ["claude", "cursor", "codex", "gemini"];

export function DispatchPanelBody() {
  const closeKind = usePanels((s) => s.closeKind);
  const [tool, setTool] = useState<Tool>("claude");
  const [spawnPath, setSpawnPath] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [discoveredRepos, setDiscoveredRepos] = useState<WorkspaceRepoEntry[]>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void window.kh
      .listWorkspaceRepos()
      .then(setDiscoveredRepos)
      .catch(() => setDiscoveredRepos([]));
    // Auto-focus the prompt so the user can start typing immediately.
    promptRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await window.kh.spawnAgent({
        prompt: trimmed,
        cwd: spawnPath || ".",
        tool,
      });
      setPrompt("");
      closeKind("dispatch");
    } finally {
      setBusy(false);
    }
  }, [prompt, busy, spawnPath, tool, closeKind]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter sends — shift+enter inserts a newline like normal.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send();
    }
  };

  const targetLabel =
    spawnPath && discoveredRepos.find((r) => r.path === spawnPath)?.label;

  return (
    <div className="dispatch-panel">
      <div className="dispatch-row">
        <label className="dispatch-label">Tool</label>
        <div className="command-tool" role="tablist" aria-label="agent tool">
          {TOOLS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tool === t}
              className={"command-tool-btn" + (tool === t ? " active" : "")}
              onClick={() => setTool(t)}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="dispatch-row">
        <label className="dispatch-label" htmlFor="dispatch-target">
          Target
        </label>
        <select
          id="dispatch-target"
          className="command-world dispatch-target"
          value={spawnPath}
          onChange={(e) => setSpawnPath(e.target.value)}
          disabled={busy}
        >
          <option value="">(this repo — keykeeper home)</option>
          {discoveredRepos.map((r) => (
            <option key={r.path} value={r.path}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="dispatch-row dispatch-prompt-row">
        <label className="dispatch-label" htmlFor="dispatch-prompt">
          Prompt
          <span className="dispatch-hint">⌘↵ to send</span>
        </label>
        <textarea
          ref={promptRef}
          id="dispatch-prompt"
          className="dispatch-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Tell ${tool} what to do in ${targetLabel ?? "this repo"}…`}
          rows={8}
          disabled={busy}
          spellCheck
          autoCapitalize="sentences"
        />
      </div>

      <div className="dispatch-footer">
        <button
          type="button"
          className="btn"
          onClick={() => closeKind("dispatch")}
          disabled={busy}
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={send}
          disabled={busy || !prompt.trim()}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          {busy ? "Spawning…" : (<><Play size={12} aria-hidden /> Spawn {tool}</>)}
        </button>
      </div>
    </div>
  );
}
