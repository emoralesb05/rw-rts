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
import { CheckboxControl } from "../components/primitives/Checkbox";
import { SegmentedControl } from "../components/kit/SegmentedControl";
import { Textarea } from "../components/kit/Textarea";
import { Toolbar } from "../components/kit/Toolbar";
import { TooltipHint } from "../components/kit/TooltipHint";
import { useToast } from "../components/kit/ToastLayer";
import { cn } from "@/lib/cn";
import type { Letter, LetterAction } from "@shared/events";
import type {
  UserInputAnswers,
  UserInputQuestion,
} from "@shared/schemas/user-input";

type UserInputValues = Record<string, string | string[]>;

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
  const [userInputValues, setUserInputValues] = useState<UserInputValues>({});
  const [copied, setCopied] = useState(false);
  // "Actionable" perm letter — has a deny-reason input. Cursor's
  // observational letters skip this since deny isn't possible at
  // that point.
  const isPermLetter = letter.actions.some(
    (a) =>
      a.action.kind === "permission-deny" ||
      (a.action.kind === "permission-choice" &&
        a.action.choiceId.startsWith("deny"))
  );
  const isPermissionLike = isPermissionLetter(letter);
  const isUserInput = isUserInputLetter(letter);
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
  const userInputQuestions = letter.userInputQuestions ?? [];
  const canSubmitUserInput =
    !isUserInput ||
    userInputQuestions.every((q) => {
      if (q.required === false) return true;
      const value = userInputValues[q.id];
      if (Array.isArray(value)) return value.length > 0;
      return !!value?.trim();
    });
  const allowShortcut = shortcutVerb(allowEntry?.label, "allow");
  const denyShortcut = shortcutVerb(denyEntry?.label, "deny");
  // Permission letters (including observational): surface the
  // requestId as a data attribute so the ActivityLog can scroll-and-
  // pulse the matching card on click.
  const requestId = letter.actions.find(
    (a) =>
      a.action.kind === "permission-allow" ||
      a.action.kind === "permission-deny" ||
      a.action.kind === "permission-choice" ||
      a.action.kind === "permission-observe" ||
      a.action.kind === "user-input-submit"
  )?.action;
  const reqIdAttr =
    requestId && "requestId" in requestId ? requestId.requestId : undefined;
  // Click body → pan the canvas camera to the wielder's world (the
  // wielder panel itself opens from the party row's chat icon, not
  // from letters). Permission letters stay non-clickable since they
  // own the activity → alert pulse pattern instead.
  const wielder = letter.sessionId ? units[letter.sessionId] : undefined;
  const targetWorldId = letter.worldId ?? wielder?.worldId;
  const bodyClickable = !isPermissionLike && !isUserInput && !!targetWorldId;
  const onBodyClick = bodyClickable
    ? () => selectWorld(targetWorldId!)
    : undefined;
  const applyAction = (action: LetterAction) => {
    if (
      (action.kind === "permission-deny" ||
        (action.kind === "permission-choice" &&
          action.choiceId.startsWith("deny"))) &&
      denyReason.trim()
    ) {
      applyLetterAction(letter, {
        ...action,
        message: denyReason.trim(),
      });
    } else if (action.kind === "user-input-submit" && !action.answers) {
      applyLetterAction(letter, {
        ...action,
        answers: buildUserInputAnswers(userInputQuestions, userInputValues),
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
    if (isUserInput && (e.metaKey || e.ctrlKey) && e.key === "Enter") {
      const action = letter.actions.find(
        (a) => a.action.kind === "user-input-submit" && !a.action.answers
      )?.action;
      if (action && canSubmitUserInput) {
        e.preventDefault();
        applyAction(action);
      }
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
      role={
        bodyClickable
          ? "button"
          : isPermissionLike || isUserInput
            ? "group"
            : undefined
      }
      tabIndex={
        bodyClickable || isPermissionLike || isUserInput ? 0 : undefined
      }
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
      {isUserInput && userInputQuestions.length > 0 && (
        <UserInputQuestions
          questions={userInputQuestions}
          values={userInputValues}
          onChange={(id, value) =>
            setUserInputValues((prev) => ({ ...prev, [id]: value }))
          }
        />
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
                : a.action.kind === "user-input-submit" && !a.action.answers
                  ? "primary"
                  : a.action.kind === "dismiss"
                    ? "ghost"
                    : "default"
            }
            className="min-h-0 px-2 py-1 text-[10.5px]"
            disabled={
              a.action.kind === "user-input-submit" &&
              !a.action.answers &&
              !canSubmitUserInput
            }
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
      a.action.kind === "permission-choice" ||
      a.action.kind === "permission-observe"
  );
}

export function isUserInputLetter(letter: Letter): boolean {
  return letter.actions.some((a) => a.action.kind === "user-input-submit");
}

export function isActionRequiredLetter(letter: Letter): boolean {
  return isPermissionLetter(letter) || isUserInputLetter(letter);
}

function buildUserInputAnswers(
  questions: readonly UserInputQuestion[],
  values: UserInputValues
): UserInputAnswers {
  const out: UserInputAnswers = {};
  for (const question of questions) {
    const value = values[question.id];
    if (Array.isArray(value)) {
      out[question.id] = { answers: value };
      continue;
    }
    const answer = value?.trim();
    out[question.id] = { answers: answer ? [answer] : [] };
  }
  return out;
}

function UserInputQuestions({
  questions,
  values,
  onChange,
}: {
  questions: readonly UserInputQuestion[];
  values: UserInputValues;
  onChange(id: string, value: string | string[]): void;
}) {
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {questions.map((question) => {
        const options = question.options ?? [];
        const currentValue = values[question.id];
        const selectedValues = Array.isArray(currentValue)
          ? currentValue
          : typeof currentValue === "string" && currentValue
            ? [currentValue]
            : [];
        return (
          <div
            key={question.id}
            className="border-accent/25 bg-accent/[0.05] flex flex-col gap-1.5 rounded-sm border px-2 py-1.5"
          >
            <div className="text-accent font-mono text-[9.5px] tracking-[0.6px] uppercase">
              {question.header}
            </div>
            <div className="text-text text-[11.5px] leading-relaxed">
              {question.question}
            </div>
            {options.length > 0 && question.multiSelect ? (
              <div className="flex flex-col gap-1">
                {options.map((option) => {
                  const value = option.value ?? option.label;
                  const checked = selectedValues.includes(value);
                  return (
                    <label
                      key={value}
                      className="hover:bg-accent/[0.08] flex cursor-pointer items-start gap-2 rounded-sm px-1 py-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <CheckboxControl
                        checked={checked}
                        onCheckedChange={(next) => {
                          const nextValues = next
                            ? [...selectedValues, value]
                            : selectedValues.filter((v) => v !== value);
                          onChange(question.id, nextValues);
                        }}
                        aria-label={option.label}
                      />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-text text-[11px] leading-snug">
                          {option.label}
                        </span>
                        {option.description && (
                          <span className="text-muted text-[10px] leading-snug">
                            {option.description}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : options.length > 0 ? (
              <>
                <SegmentedControl
                  size="sm"
                  className="w-full"
                  value={typeof currentValue === "string" ? currentValue : ""}
                  onValueChange={(value) => onChange(question.id, value)}
                  options={options.map((option) => ({
                    value: option.value ?? option.label,
                    label: option.label,
                  }))}
                />
                {typeof currentValue === "string" && currentValue && (
                  <div className="text-muted text-[10px] leading-snug">
                    {
                      options.find(
                        (option) =>
                          (option.value ?? option.label) === currentValue
                      )?.description
                    }
                  </div>
                )}
              </>
            ) : question.isSecret ? (
              <Input
                type="password"
                className="h-auto px-2 py-1.5 text-[11px]"
                value={typeof currentValue === "string" ? currentValue : ""}
                onChange={(e) => onChange(question.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                required={question.required !== false}
              />
            ) : (
              <Textarea
                className="min-h-16 px-2 py-1.5 text-[11px]"
                value={typeof currentValue === "string" ? currentValue : ""}
                onChange={(e) => onChange(question.id, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                required={question.required !== false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
