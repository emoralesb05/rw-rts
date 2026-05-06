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
import { themeFor, themeLabel } from "../../game/gummi-worlds";
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

export function LetterCard({ letter }: { letter: Letter }) {
  const applyLetterAction = useStore((s) => s.applyLetterAction);
  const units = useStore((s) => s.units);
  const worlds = useStore((s) => s.worlds);
  const selectWorld = useStore((s) => s.selectWorld);
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
  const allowAction = letter.actions.find(
    (a) => a.action.kind === "permission-allow"
  )?.action;
  const denyAction = letter.actions.find(
    (a) => a.action.kind === "permission-deny"
  )?.action;
  const observeAction = letter.actions.find(
    (a) => a.action.kind === "permission-observe"
  )?.action;
  const dismissAction = letter.actions.find(
    (a) => a.action.kind === "dismiss"
  )?.action;
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
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
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
      className={
        `throne-letter sev-${letter.severity}` +
        (bodyClickable ? " clickable" : "") +
        (isPermissionLike ? " permission" : "")
      }
      data-letter-request-id={reqIdAttr}
      onClick={onBodyClick}
      onKeyDown={onKeyDown}
      role={bodyClickable ? "button" : isPermissionLike ? "group" : undefined}
      tabIndex={bodyClickable || isPermissionLike ? 0 : undefined}
    >
      <div className="throne-letter-head">
        <span className={`throne-letter-tag sev-${letter.severity}`}>
          {letter.severity}
        </span>
        {letter.risk && (
          <span className={`letter-risk-chip risk-${letter.risk}`}>
            {letter.risk === "high"
              ? "HIGH RISK"
              : letter.risk === "elevated"
              ? "ELEVATED"
              : "LOW RISK"}
          </span>
        )}
        <span className="throne-letter-time">{timeAgo(letter.createdAt)}</span>
      </div>
      {wielder && (
        <div className="throne-letter-actor">
          <span
            className="throne-letter-avatar"
            style={{ background: ROLE_HEX[wielder.role] }}
            aria-hidden="true"
          />
          <span className="throne-letter-actor-name">
            {wielder.displayName}
          </span>
          {targetWorldId && worlds[targetWorldId] && (
            <>
              <span className="throne-letter-actor-sep">·</span>
              <span className="throne-letter-actor-world">
                {worlds[targetWorldId].label}
              </span>
              <span className="throne-letter-actor-theme">
                {themeLabel(themeFor(targetWorldId))}
              </span>
            </>
          )}
        </div>
      )}
      <div className="throne-letter-title">{letter.title}</div>
      {letter.body && (
        <div className="throne-letter-body">{letter.body}</div>
      )}
      {isPermissionLike && (
        <div className="letter-utility-row">
          <button
            type="button"
            className="letter-copy-btn"
            onClick={(e) => {
              e.stopPropagation();
              void copyRequest();
            }}
            title="copy permission request context"
          >
            {copied ? <Check size={11} aria-hidden /> : <Copy size={11} aria-hidden />}
            {copied ? "copied" : "copy request"}
          </button>
          <span className="letter-shortcuts">
            {allowAction && "A allow"}
            {allowAction && denyAction && " · "}
            {denyAction && "D deny"}
            {observeAction && "Enter ack"}
            {dismissAction && (allowAction || denyAction || observeAction) && " · "}
            {dismissAction && "Esc dismiss"}
          </span>
        </div>
      )}
      {letter.reasoning && (
        <div className="throne-letter-reasoning">
          <button
            type="button"
            className="letter-reasoning-toggle"
            onClick={(e) => {
              e.stopPropagation();
              setShowReasoning((v) => !v);
            }}
            title="show what the wielder was thinking right before this ask"
          >
            {showReasoning ? <ChevronUp size={11} aria-hidden /> : <ChevronDown size={11} aria-hidden />} thinking
          </button>
          {showReasoning && (
            <div className="letter-reasoning-body">{letter.reasoning}</div>
          )}
        </div>
      )}
      {isPermLetter && (
        <input
          type="text"
          className="letter-deny-reason"
          placeholder="deny reason (optional, shown to Claude)"
          value={denyReason}
          onChange={(e) => setDenyReason(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          aria-label="Deny reason"
        />
      )}
      <div className="throne-letter-actions">
        {letter.actions.map((a, i) => (
          <button
            key={i}
            type="button"
            className={
              "letter-verb" +
              (a.action.kind === "seal"
                ? " primary"
                : a.action.kind === "dismiss"
                ? " ghost"
                : "")
            }
            onClick={(e) => {
              e.stopPropagation();
              applyAction(a.action);
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
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
