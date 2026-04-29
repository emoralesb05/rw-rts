import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";

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
  // World picker for spawn target. Null = use keykeeper's home dir
  // (e.g. for spinning up a new wielder in this repo). Otherwise it's
  // the worldId whose stored repo path we'll pass as cwd.
  const [spawnWorldId, setSpawnWorldId] = useState<string | null>(null);
  const recognitionRef = useRef<SR | null>(null);
  const baseTextRef = useRef("");
  const selectedUnitId = useStore((s) => s.selectedUnitId);
  const units = useStore((s) => s.units);
  const worlds = useStore((s) => s.worlds);
  const selected = selectedUnitId ? units[selectedUnitId] : null;
  const worldList = Object.values(worlds).sort((a, b) =>
    a.label.localeCompare(b.label)
  );

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
        // Spawn target: chosen world's repo path, or keykeeper's home
        // when nothing's picked. Main resolves "." against its own cwd.
        const targetCwd =
          spawnWorldId && worlds[spawnWorldId] ? worlds[spawnWorldId].path : ".";
        await window.kh.spawnAgent({ prompt, cwd: targetCwd, tool });
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
    const target =
      spawnWorldId && worlds[spawnWorldId]
        ? worlds[spawnWorldId].label
        : "this repo";
    placeholder = `Spawn ${tool} in ${target}…`;
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
            value={spawnWorldId ?? ""}
            onChange={(e) => setSpawnWorldId(e.target.value || null)}
            title="Spawn target — which world (repo) to drop the wielder into"
            aria-label="Spawn target world"
            disabled={busy}
          >
            <option value="">this repo</option>
            {worldList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.label}
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
