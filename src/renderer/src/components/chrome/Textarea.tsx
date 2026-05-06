import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Textarea({
  className,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full rounded-sm border border-line bg-surface-2",
        "px-3 py-2 text-xs leading-relaxed text-text shadow-sm",
        "placeholder:text-muted/70",
        "focus:outline-none focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
