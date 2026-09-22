import { useState } from "react";
import {
  Command,
  Crosshair,
  ExternalLink,
  Send,
  Square,
  TerminalSquare,
} from "lucide-react";
import type { AgentMonitorRecord, MonitorControlName } from "@shared/schemas";
import { Button } from "../ui/components/kit/Button";
import { sessionStatus } from "./monitor-format";

export function InspectorControls({ agent }: { agent: AgentMonitorRecord }) {
  const [prompt, setPrompt] = useState("");
  const [busyAction, setBusyAction] = useState<MonitorControlName>();
  const [result, setResult] = useState<string>();
  const control = (action: MonitorControlName) =>
    agent.controls.find((entry) => entry.action === action);
  const canSend = Boolean(
    control("send")?.available && agent.tool && agent.cwd
  );

  const invoke = async (action: MonitorControlName) => {
    if (!agent.tool || !agent.cwd || !agent.nativeSessionId) return;
    if (action === "stop" && !window.confirm(`Stop ${agent.displayName}?`))
      return;
    setBusyAction(action);
    setResult(undefined);
    try {
      const response = await window.rw.controlSession({
        action: action as "send" | "interrupt" | "stop" | "attach" | "logs",
        unitId: agent.nativeSessionId,
        sessionId: agent.nativeSessionId,
        tool: agent.tool,
        cwd: agent.cwd,
        status: sessionStatus(agent.state),
        activeTurnKnown: agent.state === "working",
        prompt: action === "send" ? prompt : undefined,
      });
      setResult(
        response.ok
          ? (response.output ?? `${action} accepted`)
          : response.reason
      );
      if (response.ok && action === "send") setPrompt("");
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : `${action} failed`);
    } finally {
      setBusyAction(undefined);
    }
  };

  const focusHerdr = async () => {
    setBusyAction("attach");
    setResult(undefined);
    try {
      await window.rw.focusMonitorAgent({ agentId: agent.agentId });
      setResult("Herdr pane focused");
    } catch (cause) {
      setResult(cause instanceof Error ? cause.message : "Herdr focus failed");
    } finally {
      setBusyAction(undefined);
    }
  };

  return (
    <>
      {agent.herdrPaneId ? (
        <Button
          className="mb-2 h-8 min-h-0 w-full"
          disabled={busyAction === "attach"}
          onClick={() => void focusHerdr()}
        >
          <Crosshair size={12} aria-hidden /> Focus Herdr pane
        </Button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <ControlButton
          icon={<Square size={12} aria-hidden />}
          label="Interrupt"
          capability={control("interrupt")}
          busy={busyAction === "interrupt"}
          onClick={() => void invoke("interrupt")}
        />
        <ControlButton
          icon={<TerminalSquare size={12} aria-hidden />}
          label="Logs"
          capability={control("logs")}
          busy={busyAction === "logs"}
          onClick={() => void invoke("logs")}
        />
        <ControlButton
          icon={<ExternalLink size={12} aria-hidden />}
          label="Attach"
          capability={control("attach")}
          busy={busyAction === "attach"}
          onClick={() => void invoke("attach")}
        />
        <ControlButton
          icon={<Command size={12} aria-hidden />}
          label="Stop"
          capability={control("stop")}
          busy={busyAction === "stop"}
          onClick={() => void invoke("stop")}
          danger
        />
      </div>
      <div className="border-line bg-bg/45 mt-3 rounded-md border p-2">
        <textarea
          className="placeholder:text-muted/65 min-h-16 w-full resize-none bg-transparent p-1 text-xs leading-5 outline-none"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={control("send")?.reason ?? "Messaging is unavailable"}
          disabled={!canSend}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-muted truncate text-[10px]">
            {control("send")?.reason}
          </span>
          <Button
            variant="primary"
            className="h-7 min-h-0 flex-none px-2.5"
            disabled={!canSend || !prompt.trim() || busyAction === "send"}
            onClick={() => void invoke("send")}
          >
            <Send size={12} aria-hidden /> Send
          </Button>
        </div>
      </div>
      {result ? (
        <div className="border-line bg-surface-2/70 mt-2 max-h-32 overflow-auto rounded border p-2 font-mono text-[10px] whitespace-pre-wrap">
          {result}
        </div>
      ) : null}
    </>
  );
}

function ControlButton({
  icon,
  label,
  capability,
  busy,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  capability?: { available: boolean; reason: string };
  busy: boolean;
  onClick(): void;
  danger?: boolean;
}) {
  return (
    <Button
      variant={danger ? "danger" : "default"}
      className="h-8 min-h-0"
      disabled={!capability?.available || busy}
      title={capability?.reason ?? "Unavailable for this source"}
      onClick={onClick}
    >
      {icon} {busy ? "Working…" : label}
    </Button>
  );
}
