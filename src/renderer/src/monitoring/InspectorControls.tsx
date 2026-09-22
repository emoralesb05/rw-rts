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
import { useStore } from "../store";
import { eventMatchesAgent } from "./agent-conversation";
import {
  conversationKey,
  draftFor,
  emptyConversationDraft,
  useConversationDrafts,
} from "./conversation-drafts";

export function InspectorControls({
  agent,
  compact = false,
}: {
  agent: AgentMonitorRecord;
  compact?: boolean;
}) {
  const key = conversationKey(agent);
  const { prompt, busyAction, result, sentAt } = useConversationDrafts(
    (state) => state.entries[key] ?? emptyConversationDraft
  );
  const update = (
    patch: Parameters<
      ReturnType<typeof useConversationDrafts.getState>["update"]
    >[1]
  ) => useConversationDrafts.getState().update(key, patch);
  const events = useStore((state) => state.events);
  const activity =
    sentAt === undefined
      ? undefined
      : events.find(
          (event) =>
            event.timestamp >= sentAt &&
            eventMatchesAgent(event, agent) &&
            [
              "assistant_text",
              "tool_use",
              "tool_result",
              "error",
              "session_end",
              "permission_request",
              "user_input_request",
            ].includes(event.kind)
        );
  const progress =
    sentAt !== undefined && ["unknown", "offline"].includes(agent.state)
      ? "No fresh session evidence; delivery is unconfirmed. Check the native session before retrying."
      : activity
        ? activity.kind === "assistant_text"
          ? "Assistant reply observed after send; not a correlated delivery receipt."
          : activity.kind === "error"
            ? "Session error observed after send. Check the conversation before retrying."
            : activity.kind === "session_end"
              ? "Session ended after send; review the conversation for its outcome."
              : "Provider activity observed after send; awaiting a reply."
        : undefined;
  const control = (action: MonitorControlName) => {
    const capability = agent.controls.find((entry) => entry.action === action);
    if (capability && (!agent.tool || !agent.cwd || !agent.nativeSessionId))
      return {
        ...capability,
        available: false,
        reason: "Provider session identity or working directory is missing.",
      };
    return capability;
  };
  const messageAction = ["done", "failed"].includes(agent.state)
    ? "resume"
    : agent.state === "working" && control("steer")?.available
      ? "steer"
      : "send";
  const messageLabel =
    messageAction === "steer"
      ? "Steer active turn"
      : messageAction !== "resume" && agent.spawnedHere
        ? "Send follow-up"
        : "Resume with message";
  const messageBlocked =
    agent.state === "blocked"
      ? "Answer the pending request before sending another message."
      : ["unknown", "offline"].includes(agent.state)
        ? "Wait for fresh session evidence before messaging."
        : !agent.spawnedHere && agent.state === "working"
          ? "This observed session is working; attach to its native UI or wait before resuming it."
          : undefined;
  const canSend = Boolean(
    control(messageAction)?.available &&
    agent.tool &&
    agent.cwd &&
    agent.nativeSessionId &&
    !messageBlocked
  );

  const invoke = async (action: MonitorControlName) => {
    if (!agent.tool || !agent.cwd || !agent.nativeSessionId) return;
    if (draftFor(key).busyAction || !control(action)?.available) return;
    if (
      (action === "send" || action === "steer" || action === "resume") &&
      (!canSend || !prompt.trim())
    )
      return;
    if (action === "stop" && !window.confirm(`Stop ${agent.displayName}?`))
      return;
    update({ busyAction: action, result: undefined, sentAt: undefined });
    const startedAt = Date.now();
    try {
      const response = await window.rw.controlSession({
        action: action as
          | "send"
          | "resume"
          | "steer"
          | "interrupt"
          | "stop"
          | "attach"
          | "logs"
          | "fork",
        unitId: agent.sourceLocalId ?? agent.nativeSessionId,
        sessionId: agent.nativeSessionId,
        tool: agent.tool,
        cwd: agent.cwd,
        status: sessionStatus(agent.state),
        activeTurnKnown: agent.state === "working",
        prompt:
          action === "send" || action === "steer" || action === "resume"
            ? prompt.trim()
            : undefined,
      });
      update({
        result: response.ok
          ? (response.output ??
            `${action} accepted by Realmkeeper; waiting for provider activity.`)
          : response.reason,
      });
      if (
        response.ok &&
        (action === "send" || action === "steer" || action === "resume")
      )
        update({ prompt: "", sentAt: startedAt });
    } catch (cause) {
      update({
        result: cause instanceof Error ? cause.message : `${action} failed`,
      });
    } finally {
      update({ busyAction: undefined });
    }
  };

  const focusHerdr = async () => {
    if (draftFor(key).busyAction) return;
    update({ busyAction: "attach", result: undefined, sentAt: undefined });
    try {
      await window.rw.focusMonitorAgent({ agentId: agent.agentId });
      update({ result: "Herdr pane focused" });
    } catch (cause) {
      update({
        result: cause instanceof Error ? cause.message : "Herdr focus failed",
      });
    } finally {
      update({ busyAction: undefined });
    }
  };

  return (
    <>
      <details open={!compact}>
        <summary className="text-muted mb-2 cursor-pointer text-xs">
          Session controls
        </summary>
        {agent.herdrPaneId ? (
          <Button
            className="mb-2 h-8 min-h-0 w-full"
            disabled={Boolean(busyAction)}
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
            busy={Boolean(busyAction)}
            onClick={() => void invoke("interrupt")}
          />
          <ControlButton
            icon={<TerminalSquare size={12} aria-hidden />}
            label="Logs"
            capability={control("logs")}
            busy={Boolean(busyAction)}
            onClick={() => void invoke("logs")}
          />
          <ControlButton
            icon={<ExternalLink size={12} aria-hidden />}
            label="Attach"
            capability={control("attach")}
            busy={Boolean(busyAction)}
            onClick={() => void invoke("attach")}
          />
          <ControlButton
            icon={<Command size={12} aria-hidden />}
            label="Stop"
            capability={control("stop")}
            busy={Boolean(busyAction)}
            onClick={() => void invoke("stop")}
            danger
          />
          <ControlButton
            icon={<Command size={12} aria-hidden />}
            label="Fork session"
            capability={control("fork")}
            busy={Boolean(busyAction)}
            onClick={() => void invoke("fork")}
          />
        </div>
      </details>
      <div className="border-line bg-bg/45 mt-3 rounded-md border p-2">
        <textarea
          className="placeholder:text-muted/65 min-h-16 w-full resize-none bg-transparent p-1 text-xs leading-5 outline-none"
          value={prompt}
          aria-label="Message selected agent"
          onChange={(event) => update({ prompt: event.target.value })}
          placeholder={
            messageBlocked ??
            control(messageAction)?.reason ??
            "Messaging is unavailable"
          }
          disabled={!canSend || Boolean(busyAction)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void invoke(messageAction);
            }
          }}
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          <span className="text-muted text-[10px]">
            {messageBlocked ??
              (messageAction === "steer"
                ? "Updates the running turn."
                : messageAction !== "resume" && agent.spawnedHere
                  ? "Follow-up message; not live steering."
                  : "Starts a resumed turn, not input into the original terminal.")}
          </span>
          <Button
            variant="primary"
            className="h-7 min-h-0 flex-none px-2.5"
            disabled={!canSend || !prompt.trim() || Boolean(busyAction)}
            onClick={() => void invoke(messageAction)}
          >
            <Send size={12} aria-hidden /> {messageLabel}
          </Button>
        </div>
      </div>
      {result ? (
        <div
          role="status"
          className="border-line bg-surface-2/70 mt-2 max-h-32 overflow-auto rounded border p-2 font-mono text-[10px] whitespace-pre-wrap"
        >
          {progress ?? result}
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
