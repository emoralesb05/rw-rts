import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "inline-flex min-h-4 items-center rounded-sm border border-line",
        "bg-black/25 px-1 font-mono text-[10px] font-semibold text-muted",
        className
      )}
      {...props}
    />
  );
}
