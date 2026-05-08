import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "border-line bg-surface-2 min-h-8 w-full rounded-sm border",
        "text-text px-3 py-1.5 text-xs shadow-sm",
        "placeholder:text-muted/70",
        "focus-visible:border-accent focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
