import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { AgentTool } from "@shared/events";
import {
  PermissionRulesFileSchema,
  type PermissionChoiceId,
  type PermissionDecision,
  type PermissionRule,
  type PermissionRuleBehavior,
  type PermissionRuleMatcher,
  type PermissionRuleScope,
} from "@shared/schemas";
import {
  permissionArgKeyForInput,
  permissionMatcherForRequest,
  permissionRuleLabel,
} from "@shared/provider-permissions";
import { resolveRepoRoot } from "./repo-root";

type PermissionRequestContext = {
  provider: AgentTool;
  sessionId: string;
  cwd: string;
  repoRoot?: string;
  name?: unknown;
  input?: unknown;
};

export type PermissionRuleMatch = {
  rule: PermissionRule;
  decision: PermissionDecision;
};

const REALMKEEPER_DIR = join(homedir(), ".realmkeeper");
let permissionRulesFile = join(REALMKEEPER_DIR, "permissions.json");
let cache: PermissionRule[] | null = null;

export function listPermissionRules(): PermissionRule[] {
  return [...loadRules()];
}

export function removePermissionRule(ruleId: string): boolean {
  const rules = loadRules();
  const next = rules.filter((rule) => rule.id !== ruleId);
  if (next.length === rules.length) return false;
  saveRules(next);
  return true;
}

export function clearPermissionRules(): void {
  cache = [];
  try {
    if (existsSync(permissionRulesFile)) unlinkSync(permissionRulesFile);
  } catch {
    // ignore; clearing is best-effort
  }
}

export function addPermissionRule(args: {
  provider: AgentTool;
  behavior: PermissionRuleBehavior;
  scope: PermissionRuleScope;
  sessionId?: string;
  repoRoot?: string;
  cwd?: string;
  matcher: PermissionRuleMatcher;
  sourceRequestId?: string;
}): PermissionRule {
  const now = Date.now();
  const rule: PermissionRule = {
    id: randomUUID(),
    provider: args.provider,
    behavior: args.behavior,
    scope: args.scope,
    sessionId: args.scope === "session" ? args.sessionId : undefined,
    repoRoot: args.scope === "workspace" ? args.repoRoot : undefined,
    cwd: args.scope === "workspace" ? args.cwd : undefined,
    matcher: args.matcher,
    label: permissionRuleLabel({
      behavior: args.behavior,
      scope: args.scope,
      matcher: args.matcher,
    }),
    createdAt: now,
    sourceRequestId: args.sourceRequestId,
  };

  const rules = loadRules();
  const next = [
    rule,
    ...rules.filter(
      (existing) =>
        !sameRuleTarget(existing, rule) ||
        !sameMatcher(existing.matcher, rule.matcher)
    ),
  ];
  saveRules(next);
  return rule;
}

export function ruleFromPermissionChoice(
  choiceId: PermissionChoiceId,
  ctx: PermissionRequestContext & { requestId: string }
): PermissionRule | null {
  const behavior = behaviorForChoice(choiceId);
  const scope = scopeForChoice(choiceId);
  if (!behavior || !scope) return null;

  const matcher = permissionMatcherForRequest(ctx.name, ctx.input);
  if (!matcher.toolName) return null;

  const repoRoot = ctx.repoRoot ?? resolveRepoRoot(ctx.cwd);
  return addPermissionRule({
    provider: ctx.provider,
    behavior,
    scope,
    sessionId: ctx.sessionId,
    repoRoot,
    cwd: ctx.cwd,
    matcher,
    sourceRequestId: ctx.requestId,
  });
}

export function matchPermissionRule(
  ctx: PermissionRequestContext
): PermissionRuleMatch | null {
  const rules = loadRules();
  const repoRoot = ctx.repoRoot ?? resolveRepoRoot(ctx.cwd);
  const matcher = permissionMatcherForRequest(ctx.name, ctx.input);
  const matches = rules.filter((rule) =>
    ruleMatchesRequest(rule, {
      ...ctx,
      repoRoot,
      matcher,
      argKey: permissionArgKeyForInput(ctx.input),
    })
  );
  matches.sort(compareRulePrecedence);
  const rule = matches[0];
  return rule ? { rule, decision: rule.behavior } : null;
}

export function permissionChoiceDecision(
  choiceId: PermissionChoiceId
): PermissionDecision {
  return behaviorForChoice(choiceId) ?? "deny";
}

export function permissionChoiceWritesRule(
  choiceId: PermissionChoiceId
): boolean {
  return scopeForChoice(choiceId) !== null;
}

function loadRules(): PermissionRule[] {
  if (cache) return cache;
  if (!existsSync(permissionRulesFile)) {
    cache = [];
    return cache;
  }
  try {
    const raw = readFileSync(permissionRulesFile, "utf8");
    const parsed = PermissionRulesFileSchema.safeParse(JSON.parse(raw));
    cache = parsed.success ? parsed.data.rules : [];
  } catch {
    cache = [];
  }
  return cache;
}

function saveRules(rules: PermissionRule[]): void {
  cache = rules;
  try {
    mkdirSync(dirname(permissionRulesFile), { recursive: true });
    writeFileSync(
      permissionRulesFile,
      JSON.stringify({ schemaVersion: 1, rules }, null, 2),
      "utf8"
    );
  } catch (err) {
    console.error("[realmkeeper] permission rule save failed:", err);
  }
}

function behaviorForChoice(
  choiceId: PermissionChoiceId
): PermissionRuleBehavior | null {
  switch (choiceId) {
    case "allow-once":
    case "allow-session":
    case "allow-workspace":
    case "allow-global":
      return "allow";
    case "deny":
    case "deny-session":
    case "deny-workspace":
    case "deny-global":
      return "deny";
  }
}

function scopeForChoice(
  choiceId: PermissionChoiceId
): PermissionRuleScope | null {
  switch (choiceId) {
    case "allow-session":
    case "deny-session":
      return "session";
    case "allow-workspace":
    case "deny-workspace":
      return "workspace";
    case "allow-global":
    case "deny-global":
      return "global";
    default:
      return null;
  }
}

function ruleMatchesRequest(
  rule: PermissionRule,
  ctx: PermissionRequestContext & {
    repoRoot: string;
    matcher: PermissionRuleMatcher;
    argKey: string;
  }
): boolean {
  if (rule.provider !== ctx.provider) return false;
  if (rule.scope === "session" && rule.sessionId !== ctx.sessionId) {
    return false;
  }
  if (
    rule.scope === "workspace" &&
    rule.repoRoot !== ctx.repoRoot &&
    rule.cwd !== ctx.cwd
  ) {
    return false;
  }
  if (rule.matcher.toolName && rule.matcher.toolName !== ctx.matcher.toolName) {
    return false;
  }
  if (rule.matcher.argKey && rule.matcher.argKey !== ctx.argKey) {
    return false;
  }
  return true;
}

function compareRulePrecedence(a: PermissionRule, b: PermissionRule): number {
  const diff = ruleScore(b) - ruleScore(a);
  if (diff !== 0) return diff;
  return b.createdAt - a.createdAt;
}

function ruleScore(rule: PermissionRule): number {
  if (rule.behavior === "deny") {
    if (rule.scope === "global") return 600;
    if (rule.scope === "workspace") return 500;
    return 400;
  }
  if (rule.scope === "session") return 300;
  if (rule.scope === "workspace") return 200;
  return 100;
}

function sameRuleTarget(a: PermissionRule, b: PermissionRule): boolean {
  return (
    a.provider === b.provider &&
    a.behavior === b.behavior &&
    a.scope === b.scope &&
    a.sessionId === b.sessionId &&
    a.repoRoot === b.repoRoot &&
    a.cwd === b.cwd
  );
}

function sameMatcher(
  a: PermissionRuleMatcher,
  b: PermissionRuleMatcher
): boolean {
  return a.toolName === b.toolName && a.argKey === b.argKey;
}

export function setPermissionRulesFileForTests(path: string): void {
  permissionRulesFile = path;
  cache = null;
}

export function resetPermissionRulesForTests(): void {
  permissionRulesFile = join(REALMKEEPER_DIR, "permissions.json");
  cache = null;
}
