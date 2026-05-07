/**
 * Per-wielder send-prompt input. Lives at the bottom of the chat-
 * drawer's active tab. Every wielder gets its own focused input;
 * disabled (with a hint) for observed-only wielders since keykeeper
 * can't drive them.
 */
import { useCallback, useState } from "react";
import type { UnitState } from "@shared/events";
import { Button } from "../components/chrome/Button";
import { Textarea } from "../components/chrome/Textarea";

export function WielderChatInput({ unit }: { unit: UnitState }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const ghosted = unit.status === "complete" || unit.status === "fallen";
  const observed = !unit.spawnedHere;
  const disabled = busy || ghosted || observed;

  const send = useCallback(async () => {
    const text = prompt.trim();
    if (!text || disabled) return;
    setBusy(true);
    try {
      await window.kh.sendPrompt({ unitId: unit.id, prompt: text });
      setPrompt("");
    } finally {
      setBusy(false);
    }
  }, [prompt, disabled, unit.id]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter sends; shift+enter inserts a newline; bare Enter
    // also sends if the textarea hasn't grown to multi-line yet (one-
    // line case feels chatty). Stick to Cmd+Enter for predictability.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send();
    }
  };

  let placeholder: string;
  if (ghosted) placeholder = `${unit.displayName} is no longer active.`;
  else if (observed)
    placeholder = `${unit.displayName} is observed-only — can't be commanded.`;
  else placeholder = `Message ${unit.displayName}…  (⌘↵ to send)`;

  return (
    <div className="wielder-chat-input">
      <Textarea
        className="wielder-chat-textarea font-mono"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        spellCheck
      />
      <Button
        type="button"
        variant="primary"
        className="wielder-chat-send"
        onClick={send}
        disabled={disabled || !prompt.trim()}
      >
        {busy ? "…" : "send"}
      </Button>
    </div>
  );
}
