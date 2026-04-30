/**
 * Letter card — used by both AlertsHUD (permission letters) and
 * LettersHUD (informational letters). Renders severity tag, risk chip,
 * title/body, expandable thinking, deny-reason input on permission
 * letters, and the action button row.
 */
import { useState } from "react";
import { useStore } from "../../store";
import type { Letter } from "@shared/events";

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
  const selectWorld = useStore((s) => s.selectWorld);
  const [showReasoning, setShowReasoning] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  const isPermLetter = letter.actions.some(
    (a) => a.action.kind === "permission-deny"
  );
  // Permission letters: surface the requestId as a data attribute so
  // the ActivityLog can scroll-and-pulse the matching card on click.
  const requestId = letter.actions.find(
    (a) =>
      a.action.kind === "permission-allow" || a.action.kind === "permission-deny"
  )?.action;
  const reqIdAttr =
    requestId && "requestId" in requestId ? requestId.requestId : undefined;
  // Click body → pan the canvas camera to the wielder's world (the
  // wielder panel itself opens from the party row's chat icon, not
  // from letters). Permission letters stay non-clickable since they
  // own the activity → alert pulse pattern instead.
  const wielder = letter.sessionId ? units[letter.sessionId] : undefined;
  const targetWorldId = letter.worldId ?? wielder?.worldId;
  const bodyClickable = !isPermLetter && !!targetWorldId;
  const onBodyClick = bodyClickable
    ? () => selectWorld(targetWorldId!)
    : undefined;
  return (
    <div
      className={
        `throne-letter sev-${letter.severity}` +
        (bodyClickable ? " clickable" : "")
      }
      data-letter-request-id={reqIdAttr}
      onClick={onBodyClick}
      role={bodyClickable ? "button" : undefined}
      tabIndex={bodyClickable ? 0 : undefined}
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
      <div className="throne-letter-title">{letter.title}</div>
      {letter.body && (
        <div className="throne-letter-body">{letter.body}</div>
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
            {showReasoning ? "▲ thinking" : "▼ thinking"}
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
              if (a.action.kind === "permission-deny" && denyReason.trim()) {
                applyLetterAction(letter, {
                  ...a.action,
                  message: denyReason.trim(),
                });
              } else {
                applyLetterAction(letter, a.action);
              }
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
    (a) => a.action.kind === "permission-allow" || a.action.kind === "permission-deny"
  );
}
