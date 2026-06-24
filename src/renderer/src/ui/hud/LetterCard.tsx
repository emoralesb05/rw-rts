/**
 * Letter card — used by both AlertsHUD (permission letters) and
 * LettersHUD (informational letters). Renders severity tag, risk chip,
 * title/body, expandable thinking, deny-reason input on permission
 * letters, and the action button row.
 */
import { useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide-react";
import { useStore } from "../../store";
import { ROLE_HEX } from "../../game/units";
import { themeFor, themeLabel } from "../../game/realm-worlds";
import { Badge } from "../components/kit/Badge";
import { Button } from "../components/kit/Button";
import { Input } from "../components/kit/Input";
import { Toolbar } from "../components/kit/Toolbar";
import { TooltipHint } from "../components/kit/TooltipHint";
import { useToast } from "../components/kit/ToastLayer";
import { cn } from "@/lib/cn";
import type { Letter, LetterAction } from "@shared/events";

function timeAgo(ts: number): string {
  const ms = Date.now() - ts;
  if (ms < 30_000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function shortcutVerb(label: string | undefined, fallback: string): string {
  return (label ?? fallback).replace(/[✓✗↪]/g, "").trim() || fallback;
}

function severityClass(severity: Letter["severity"]) {
  switch (severity) {
    case "critical":
      return "border-l-[#ff5a3c]";
    case "important":
      return "border-l-accent-alt";
    default:
      return "border-l-accent";
  }
}

function severityTone(severity: Letter["severity"]) {
  switch (severity) {
    case "critical":
      return "danger";
    case "important":
      return "gold";
    default:
      return "accent";
  }
}

function riskTone(risk: NonNullable<Letter["risk"]>) {
  switch (risk) {
    case "high":
      return "danger";
    case "elevated":
      return "warning";
    default:
      return "success";
  }
}

export function LetterCard({ letter }: { letter: Letter }) {
  const applyLetterAction = useStore((s) => s.applyLetterAction);
  const units = useStore((s) => s.units);
  const worlds = useStore((s) => s.worlds);
  const selectWorld = useStore((s) => s.selectWorld);
  const { notify } = useToast();
  const [showReasoning, setShowReasoning] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const [copied, setCopied] = useState(false);
  // "Actionable" perm letter — has a deny-reason input. Cursor's
  // observational letters skip this since deny isn't possible at
  // that point.
  const isPermLetter = letter.actions.some(
    (a) => a.action.kind === "permission-deny"
  );
  const isPermissionLike = isPermissionLetter(letter);
  const allowEntry = letter.actions.find(
    (a) => a.action.kind === "permission-allow"
  );
  const denyEntry = letter.actions.find(
    (a) => a.action.kind === "permission-deny"
  );
  const allowAction = allowEntry?.action;
  const denyAction = denyEntry?.action;
  const observeAction = letter.actions.find(
    (a) => a.action.kind === "permission-observe"
  )?.action;
  const dismissAction = letter.actions.find(
    (a) => a.action.kind === "dismiss"
  )?.action;
  const allowShortcut = shortcutVerb(allowEntry?.label, "allow");
  const denyShortcut = shortcutVerb(denyEntry?.label, "deny");
  // Permission letters (including observational): surface the
  // requestId as a data attribute so the ActivityLog can scroll-and-
  // pulse the matching card on click.
  const requestId = letter.actions.find(
    (a) =>
      a.action.kind === "permission-allow" ||
      a.action.kind === "permission-deny" ||
      a.action.kind === "permission-observe"
  )?.action;
  const reqIdAttr =
    requestId && "requestId" in requestId ? requestId.requestId : undefined;
  // Click body → pan the canvas camera to the wielder's world (the
  // wielder panel itself opens from the party row's chat icon, not
  // from letters). Permission letters stay non-clickable since they
  // own the activity → alert pulse pattern instead.
  const wielder = letter.sessionId ? units[letter.sessionId] : undefined;
  const targetWorldId = letter.worldId ?? wielder?.worldId;
  const bodyClickable = !isPermissionLike && !!targetWorldId;
  const onBodyClick = bodyClickable
    ? () => selectWorld(targetWorldId!)
    : undefined;
  const applyAction = (action: LetterAction) => {
    if (action.kind === "permission-deny" && denyReason.trim()) {
      applyLetterAction(letter, {
        ...action,
        message: denyReason.trim(),
      });
    } else {
      applyLetterAction(letter, action);
    }
  };
  const copyRequest = async () => {
    const text = [
      letter.title,
      letter.body,
      letter.reasoning ? `Thinking:\n${letter.reasoning}` : undefined,
    ]
      .filter(Boolean)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      notify({ title: "Request copied", tone: "success" });
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
      notify({
        title: "Copy failed",
        description: "Clipboard access was blocked by the renderer.",
        tone: "danger",
      });
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const tag = target.tagName.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "button") return;
    if (bodyClickable && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onBodyClick?.();
      return;
    }
    if (!isPermissionLike) return;
    const key = e.key.toLowerCase();
    if (key === "a" && allowAction) {
      e.preventDefault();
      applyAction(allowAction);
    } else if (key === "d" && denyAction) {
      e.preventDefault();
      applyAction(denyAction);
    } else if (key === "enter" && observeAction) {
      e.preventDefault();
      applyAction(observeAction);
    } else if (key === "escape" && dismissAction) {
      e.preventDefault();
      applyAction(dismissAction);
    }
  };
  return (
    <div
      className={cn(
        "throne-letter border-line flex flex-col gap-1 rounded-md border border-l-[3px]",
        "bg-panel-2/65 px-2.5 py-2 text-left",
        severityClass(letter.severity),
        bodyClickable &&
          "hover:border-accent-alt/30 hover:bg-panel-2/85 focus-visible:outline-accent-alt cursor-pointer transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1",
        isPermissionLike &&
          "border-warning/40 focus-visible:outline-warning/85 bg-[#231830]/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      )}
      data-letter-request-id={reqIdAttr}
      onClick={onBodyClick}
      onKeyDown={onKeyDown}
      role={bodyClickable ? "button" : isPermissionLike ? "group" : undefined}
      tabIndex={bodyClickable || isPermissionLike ? 0 : undefined}
    >
      <div className="flex items-center justify-between gap-2 text-[9.5px] tracking-[0.6px] uppercase">
        <Badge
          tone={severityTone(letter.severity)}
          className="min-h-0 px-1.5 py-0.5 text-[9.5px]"
        >
          {letter.severity}
        </Badge>
        {letter.risk && (
          <Badge
            tone={riskTone(letter.risk)}
            className={cn(
              "min-h-0 px-1.5 py-0.5 font-mono text-[8.5px] tracking-[1px]",
              letter.risk === "high" &&
                "animate-[voice-pulse_1.4s_ease-in-out_infinite]"
            )}
          >
            {letter.risk === "high"
              ? "HIGH RISK"
              : letter.risk === "elevated"
                ? "ELEVATED"
                : "LOW RISK"}
          </Badge>
        )}
        <span className="text-muted shrink-0 font-mono">
          {timeAgo(letter.createdAt)}
        </span>
      </div>
      {wielder && (
        <div className="text-muted flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[10.5px]">
          <span
            className="rounded-pill size-2.5 shrink-0 border border-black/40"
            style={{ background: ROLE_HEX[wielder.role] }}
            aria-hidden="true"
          />
          <span className="font-ui text-text max-w-full min-w-0 overflow-hidden font-semibold text-ellipsis whitespace-nowrap">
            {wielder.displayName}
          </span>
          {targetWorldId && worlds[targetWorldId] && (
            <>
              <span className="text-muted/50 shrink-0">·</span>
              <span className="text-accent max-w-[130px] min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                {worlds[targetWorldId].label}
              </span>
              <span className="text-muted/70 max-w-[120px] min-w-0 overflow-hidden text-[9.5px] text-ellipsis whitespace-nowrap">
                {themeLabel(themeFor(targetWorldId))}
              </span>
            </>
          )}
        </div>
      )}
      <div className="text-text text-[12.5px] font-semibold break-words">
        {letter.title}
      </div>
      {letter.body && (
        <div className="text-muted text-[11px] leading-relaxed break-words">
          {letter.body}
        </div>
      )}
      {isPermissionLike && (
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          <TooltipHint label="copy permission request context">
            <Button
              type="button"
              className="border-warning/30 bg-warning/10 text-warning hover:border-warning/60 hover:bg-warning/15 min-h-0 px-1.5 py-0.5 font-mono text-[9.5px]"
              onClick={(e) => {
                e.stopPropagation();
                void copyRequest();
              }}
            >
              {copied ? (
                <Check size={11} aria-hidden />
              ) : (
                <Copy size={11} aria-hidden />
              )}
              {copied ? "copied" : "copy request"}
            </Button>
          </TooltipHint>
          <span className="text-text/50 font-mono text-[9.5px]">
            {allowAction && `A ${allowShortcut}`}
            {allowAction && denyAction && " · "}
            {denyAction && `D ${denyShortcut}`}
            {observeAction && "Enter ack"}
            {dismissAction &&
              (allowAction || denyAction || observeAction) &&
              " · "}
            {dismissAction && "Esc dismiss"}
          </span>
        </div>
      )}
      {letter.reasoning && (
        <div className="mt-0.5">
          <TooltipHint label="show what the wielder was thinking right before this ask">
            <Button
              type="button"
              className="border-accent/40 text-accent hover:bg-accent/10 min-h-0 bg-transparent px-1.5 py-0.5 font-mono text-[9.5px] tracking-[0.5px]"
              onClick={(e) => {
                e.stopPropagation();
                setShowReasoning((v) => !v);
              }}
            >
              {showReasoning ? (
                <ChevronUp size={11} aria-hidden />
              ) : (
                <ChevronDown size={11} aria-hidden />
              )}{" "}
              thinking
            </Button>
          </TooltipHint>
          {showReasoning && (
            <div className="border-accent/40 bg-accent/[0.06] text-text mt-1 rounded-r-sm border-l-2 px-2 py-1.5 text-[10.5px] leading-relaxed whitespace-pre-wrap italic">
              {letter.reasoning}
            </div>
          )}
        </div>
      )}
      {isPermLetter && (
        <Input
          type="text"
          className="my-1.5 h-auto w-full rounded-sm bg-[#0a1130]/60 px-1.5 py-1 text-[11px] placeholder:italic"
          placeholder="deny reason (optional, shown to the agent)"
          value={denyReason}
          onChange={(e) => setDenyReason(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Deny reason"
        />
      )}
      <Toolbar className="mt-1 flex-wrap gap-1" aria-label="Letter actions">
        {letter.actions.map((a, i) => (
          <Button
            key={i}
            type="button"
            variant={
              a.action.kind === "seal"
                ? "primary"
                : a.action.kind === "dismiss"
                  ? "ghost"
                  : "default"
            }
            className="min-h-0 px-2 py-1 text-[10.5px]"
            onClick={(e) => {
              e.stopPropagation();
              applyAction(a.action);
            }}
          >
            {a.label}
          </Button>
        ))}
      </Toolbar>
    </div>
  );
}

export function isPermissionLetter(letter: Letter): boolean {
  return letter.actions.some(
    (a) =>
      a.action.kind === "permission-allow" ||
      a.action.kind === "permission-deny" ||
      a.action.kind === "permission-observe"
  );
}
