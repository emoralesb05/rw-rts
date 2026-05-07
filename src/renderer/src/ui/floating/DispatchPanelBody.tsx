/**
 * Dispatch dialog — opens from the WielderHUD's "+ dispatch" button.
 * Roomy spawn surface so the King can compose a real prompt with all
 * context (tool, target world, multi-line directive) before kicking
 * off a wielder. Replaces the old bottom-strip spawn role.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { usePanels } from "./panel-store";
import { Button } from "../../components/chrome/Button";
import { Field } from "../../components/chrome/Field";
import { Kbd } from "../../components/chrome/Kbd";
import { SegmentedControl } from "../../components/chrome/SegmentedControl";
import { Textarea } from "../../components/chrome/Textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/primitives/Select";
import type { WorkspaceRepoEntry } from "@shared/schemas";

type Tool = "claude" | "cursor" | "codex" | "gemini";
const TOOLS: Tool[] = ["claude", "cursor", "codex", "gemini"];
const TOOL_OPTIONS = TOOLS.map((tool) => ({ value: tool, label: tool }));
const CURRENT_REPO_VALUE = "__keykeeper_current_repo__";

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
      <Field className="dispatch-row" label="Tool">
        <SegmentedControl
          aria-label="agent tool"
          className="command-tool"
          value={tool}
          onValueChange={(value) => setTool(value as Tool)}
          options={TOOL_OPTIONS}
        />
      </Field>

      <Field
        className="dispatch-row"
        htmlFor="dispatch-target"
        label="Target"
      >
        <Select
          value={spawnPath || CURRENT_REPO_VALUE}
          onValueChange={(value) =>
            setSpawnPath(value === CURRENT_REPO_VALUE ? "" : value)
          }
          disabled={busy}
        >
          <SelectTrigger
            id="dispatch-target"
            className="command-world dispatch-target"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CURRENT_REPO_VALUE}>
              (this repo — keykeeper home)
            </SelectItem>
            {discoveredRepos.map((r) => (
              <SelectItem key={r.path} value={r.path}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        className="dispatch-row dispatch-prompt-row"
        htmlFor="dispatch-prompt"
        label="Prompt"
        description={
          <span className="inline-flex items-center gap-1">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
            <span>to send</span>
          </span>
        }
      >
        <Textarea
          ref={promptRef}
          id="dispatch-prompt"
          className="dispatch-prompt font-mono"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Tell ${tool} what to do in ${targetLabel ?? "this repo"}…`}
          rows={8}
          disabled={busy}
          spellCheck
          autoCapitalize="sentences"
        />
      </Field>

      <div className="dispatch-footer">
        <Button
          type="button"
          onClick={() => closeKind("dispatch")}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={send}
          disabled={busy || !prompt.trim()}
        >
          {busy ? "Spawning…" : (<><Play size={12} aria-hidden /> Spawn {tool}</>)}
        </Button>
      </div>
    </div>
  );
}
