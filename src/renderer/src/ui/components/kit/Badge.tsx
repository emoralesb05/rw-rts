import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type BadgeTone =
  | "default"
  | "muted"
  | "accent"
  | "gold"
  | "success"
  | "warning"
  | "danger";

export type BadgeProps = ComponentProps<"span"> & {
  tone?: BadgeTone;
};

export function Badge({ className, tone = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center gap-1 rounded-sm border px-1.5 whitespace-nowrap",
        "text-[10px] leading-none font-bold tracking-[0.4px] uppercase",
        tone === "default" && "border-line bg-surface-2 text-text",
        tone === "muted" && "border-line text-muted bg-black/15",
        tone === "accent" && "border-accent/50 bg-accent/15 text-accent",
        tone === "gold" &&
          "border-accent-alt/50 bg-accent-alt/15 text-accent-alt",
        tone === "success" && "border-success/50 bg-success/15 text-success",
        tone === "warning" && "border-warning/50 bg-warning/15 text-warning",
        tone === "danger" && "border-danger/50 bg-danger/15 text-danger",
        className
      )}
      {...props}
    />
  );
}
