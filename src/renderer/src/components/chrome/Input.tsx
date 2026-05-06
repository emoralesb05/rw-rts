import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "min-h-8 w-full rounded-sm border border-line bg-surface-2",
        "px-3 py-1.5 text-xs text-text shadow-sm",
        "placeholder:text-muted/70",
        "focus:outline-none focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
