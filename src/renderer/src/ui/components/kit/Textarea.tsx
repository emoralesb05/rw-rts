import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "border-line bg-surface-2 min-h-24 w-full rounded-sm border",
        "text-text px-3 py-2 text-xs leading-relaxed shadow-sm",
        "placeholder:text-muted/70",
        "focus-visible:border-accent focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}
