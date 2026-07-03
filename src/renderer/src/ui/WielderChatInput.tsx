/**
 * Per-wielder send-prompt input. Lives at the bottom of the chat-
 * drawer's active tab. Every wielder gets its own focused input;
 * observed wielders are driven through provider-specific session resume.
 */
import { useCallback, useState } from "react";
import { OctagonX, Send } from "lucide-react";
import type { UnitState } from "@shared/events";
import { capabilitiesForUnit } from "@shared/session-capabilities";
import { Button } from "./components/kit/Button";
import { Textarea } from "./components/kit/Textarea";
import { cn } from "@/lib/cn";

export function WielderChatInput({ unit }: { unit: UnitState }) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const capabilities = capabilitiesForUnit(unit);
  const sendCapability = capabilities.controls.send;
  const interruptCapability = capabilities.controls.interrupt;
  const disabled = busy || !sendCapability.available;
  const interruptDisabled = interrupting || !interruptCapability.available;

  const send = useCallback(async () => {
    const text = prompt.trim();
    if (!text || disabled) return;
    setBusy(true);
    try {
      const result = await window.rw.controlSession({
        action: "send",
        unitId: unit.id,
        sessionId: unit.sessionId,
        tool: unit.tool,
        cwd: unit.cwd,
        status: unit.status,
        prompt: text,
      });
      if (!result.ok) throw new Error(result.reason ?? "Send failed.");
      setPrompt("");
    } catch {
      // Keep the text in place so the user can retry.
    } finally {
      setBusy(false);
    }
  }, [
    prompt,
    disabled,
    unit.id,
    unit.sessionId,
    unit.tool,
    unit.cwd,
    unit.status,
  ]);

  const interrupt = useCallback(async () => {
    if (interruptDisabled) return;
    setInterrupting(true);
    try {
      await window.rw.controlSession({
        action: "interrupt",
        unitId: unit.id,
        sessionId: unit.sessionId,
        tool: unit.tool,
        cwd: unit.cwd,
        status: unit.status,
      });
    } catch {
      // The running prompt, if any, remains visible and can be retried.
    } finally {
      setInterrupting(false);
    }
  }, [
    interruptDisabled,
    unit.id,
    unit.sessionId,
    unit.tool,
    unit.cwd,
    unit.status,
  ]);

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
  if (!sendCapability.available) placeholder = sendCapability.reason;
  else placeholder = `Message ${unit.displayName}…  (⌘↵ to send)`;

  const canSend = !disabled && !!prompt.trim();

  return (
    <div className="border-line sticky bottom-0 z-[1] flex flex-none items-end gap-2.5 border-t bg-[rgba(5,9,18,0.94)] px-3 py-2.5 shadow-[0_-10px_24px_rgba(0,0,0,0.22)] backdrop-blur-sm">
      <Textarea
        className="bg-surface-2/90 max-h-[150px] min-h-10 flex-1 resize-y rounded-sm px-2.5 py-1.5 font-mono text-[12px] leading-[1.4]"
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
        className={cn(
          "h-9 min-h-9 w-20 px-3 py-1.5 text-[11px]",
          "border-[#ffa850]/45 bg-[#ffa850]/[0.08] text-[#ffb070] hover:border-[#ffa850]/70 hover:bg-[#ffa850]/[0.14]"
        )}
        onClick={interrupt}
        disabled={interruptDisabled}
        aria-label={`Interrupt active turn for ${unit.displayName}`}
        title={
          interruptCapability.available
            ? `Interrupt active turn for ${unit.displayName}`
            : interruptCapability.reason
        }
      >
        {interrupting ? (
          "…"
        ) : (
          <>
            <OctagonX size={13} aria-hidden /> halt
          </>
        )}
      </Button>
      <Button
        type="button"
        variant={canSend ? "primary" : "default"}
        className="h-9 min-h-9 w-24 px-3 py-1.5 text-[11px]"
        onClick={send}
        disabled={!canSend}
        aria-label={`Send message to ${unit.displayName}`}
      >
        {busy ? (
          "…"
        ) : (
          <>
            <Send size={13} aria-hidden /> send
          </>
        )}
      </Button>
    </div>
  );
}
