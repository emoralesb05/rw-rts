import type { ComponentProps } from "react";
import { Badge } from "./components/kit/Badge";
import { cn } from "@/lib/cn";
import type { AgentTool } from "@shared/events";

export const AGENT_TOOL_LABEL: Record<AgentTool, string> = {
  claude: "Claude",
  cursor: "Cursor",
  codex: "Codex",
  gemini: "Gemini",
};

const TOOL_BADGE_CLASS: Record<AgentTool, string> = {
  claude:
    "border-accent-alt/55 bg-accent-alt/[0.12] text-accent-alt",
  cursor:
    "border-[#9d6bff]/50 bg-[#9d6bff]/[0.14] text-[#c9a4ff]",
  codex:
    "border-success/50 bg-success/[0.12] text-success",
  gemini:
    "border-accent/50 bg-accent/[0.13] text-accent",
};

export type AgentToolBadgeProps = ComponentProps<"span"> & {
  tool: AgentTool;
};

export function AgentToolBadge({
  children,
  className,
  tool,
  ...props
}: AgentToolBadgeProps) {
  return (
    <Badge
      className={cn(
        "h-4 min-h-0 px-1 text-[9px]",
        TOOL_BADGE_CLASS[tool],
        className
      )}
      {...props}
    >
      {children ?? AGENT_TOOL_LABEL[tool]}
    </Badge>
  );
}
