import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import type { WorkspaceRepoEntry } from "@shared/ipc";

type Tool = "claude" | "cursor" | "codex";

const TOOLS: Tool[] = ["claude", "cursor", "codex"];

// Web Speech API — local STT in the browser. Per Q38 (vision.md):
// transcription-only, manual review before send. No audio leaves the
// device.
type SR = {
  start(): void;
  stop(): void;
  abort(): void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
function getSpeechRecognition(): (new () => SR) | null {
  const w = window as unknown as {
    SpeechRecognition?: new () => SR;
    webkitSpeechRecognition?: new () => SR;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function CommandInput() {
  const [text, setText] = useState("");
  const [tool, setTool] = useState<Tool>("claude");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  // Spawn target = a repo path (absolute). We discover repos under the
  // user's workspace root once on mount, then merge with any worlds
  // keykeeper already knows about (so events from outside the workspace
  // are still spawnable). Empty string = "this repo" (keykeeper home).
  const [spawnPath, setSpawnPath] = useState<string>("");
  const [discoveredRepos, setDiscoveredRepos] = useState<WorkspaceRepoEntry[]>([]);
  const recognitionRef = useRef<SR | null>(null);
  const baseTextRef = useRef("");
  const selectedUnitId = useStore((s) => s.selectedUnitId);
  const units = useStore((s) => s.units);
  const worlds = useStore((s) => s.worlds);
  const selected = selectedUnitId ? units[selectedUnitId] : null;

  useEffect(() => {
    const refresh = () => {
      void window.kh
        .listWorkspaceRepos()
        .then(setDiscoveredRepos)
        .catch(() => setDiscoveredRepos([]));
    };
    refresh();
    // Re-fetch when settings change so a freshly excluded repo
    // disappears from the dropdown without an app restart.
    window.addEventListener("kh:settings-changed", refresh);
    return () => window.removeEventListener("kh:settings-changed", refresh);
  }, []);

  // Spawn target list: discovered repos ∪ already-active worlds (the
  // latter may live outside the workspace root). Dedup by path; sort
  // by label.
  type Target = { path: string; label: string };
  const targetList: Target[] = (() => {
    const byPath = new Map<string, Target>();
    for (const r of discoveredRepos) byPath.set(r.path, r);
    for (const w of Object.values(worlds)) {
      if (!byPath.has(w.path)) byPath.set(w.path, { path: w.path, label: w.label });
    }
    return [...byPath.values()].sort((a, b) => a.label.localeCompare(b.label));
  })();
  const targetLabel =
    spawnPath && targetList.find((t) => t.path === spawnPath)?.label;

  const SRClass = getSpeechRecognition();
  const voiceSupported = SRClass !== null;

  // Cleanup any active recognition on unmount.
  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  const sendDisabled =
    busy || !text.trim() || (selected !== null && !selected.spawnedHere);

  async function send() {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setBusy(true);
    try {
      if (selected) {
        if (!selected.spawnedHere) return;
        await window.kh.sendPrompt({ unitId: selected.id, prompt });
      } else {
        // Spawn target: chosen repo path, or keykeeper's home when
        // nothing's picked. Main resolves "." against its own cwd.
        await window.kh.spawnAgent({
          prompt,
          cwd: spawnPath || ".",
          tool,
        });
      }
      setText("");
    } finally {
      setBusy(false);
    }
  }

  function toggleVoice() {
    if (!SRClass) return;
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SRClass();
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = navigator.language || "en-US";
    baseTextRef.current = text ? text + " " : "";
    rec.onresult = (event) => {
      let transcript = "";
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setText(baseTextRef.current + transcript);
    };
    const stop = () => {
      setListening(false);
      recognitionRef.current = null;
    };
    rec.onend = stop;
    rec.onerror = stop;
    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      stop();
    }
  }

  let placeholder: string;
  if (selected && !selected.spawnedHere) {
    placeholder = `${selected.role} is observed-only (not spawned here)`;
  } else if (selected) {
    placeholder = `Command ${selected.role}…`;
  } else {
    placeholder = `Spawn ${tool} in ${targetLabel ?? "this repo"}…`;
  }

  return (
    <div className="command">
      {!selected && (
        <>
          <div className="command-tool" role="tablist" aria-label="agent tool">
            {TOOLS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tool === t}
                className={"command-tool-btn" + (tool === t ? " active" : "")}
                onClick={() => setTool(t)}
                title={`Spawn a ${t} agent`}
              >
                {t}
              </button>
            ))}
          </div>
          <select
            className="command-world"
            value={spawnPath}
            onChange={(e) => setSpawnPath(e.target.value)}
            title="Spawn target — which repo (any git repo under your workspace root) to drop the wielder into"
            aria-label="Spawn target repo"
            disabled={busy}
          >
            <option value="">this repo</option>
            {targetList.map((t) => (
              <option key={t.path} value={t.path}>
                {t.label}
              </option>
            ))}
          </select>
        </>
      )}
      <input
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !sendDisabled && send()}
        disabled={busy || (selected !== null && !selected.spawnedHere)}
      />
      {voiceSupported && (
        <button
          type="button"
          className={"btn voice-btn" + (listening ? " listening" : "")}
          onClick={toggleVoice}
          disabled={busy || (selected !== null && !selected.spawnedHere)}
          title={listening ? "stop listening" : "dictate (Web Speech)"}
          aria-label={listening ? "stop voice input" : "start voice input"}
        >
          {listening ? "● rec" : "🎤"}
        </button>
      )}
      <button className="btn primary" onClick={send} disabled={sendDisabled}>
        {selected ? "send" : "spawn"}
      </button>
    </div>
  );
}
