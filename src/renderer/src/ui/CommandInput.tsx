import { useState } from "react";
import { useStore } from "../store";

type Tool = "claude" | "cursor" | "codex";

const TOOLS: Tool[] = ["claude", "cursor", "codex"];

export function CommandInput() {
  const [text, setText] = useState("");
  const [tool, setTool] = useState<Tool>("claude");
  const [busy, setBusy] = useState(false);
  const selectedUnitId = useStore((s) => s.selectedUnitId);
  const units = useStore((s) => s.units);
  const selected = selectedUnitId ? units[selectedUnitId] : null;

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
        await window.kh.spawnAgent({ prompt, cwd: ".", tool });
      }
      setText("");
    } finally {
      setBusy(false);
    }
  }

  let placeholder: string;
  if (selected && !selected.spawnedHere) {
    placeholder = `${selected.role} is observed-only (not spawned here)`;
  } else if (selected) {
    placeholder = `Command ${selected.role}…`;
  } else {
    placeholder = `Spawn ${tool} agent with a prompt…`;
  }

  return (
    <div className="command">
      {!selected && (
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
      )}
      <input
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !sendDisabled && send()}
        disabled={busy || (selected !== null && !selected.spawnedHere)}
      />
      <button className="btn primary" onClick={send} disabled={sendDisabled}>
        {selected ? "send" : "spawn"}
      </button>
    </div>
  );
}
