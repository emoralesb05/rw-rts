import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Pill({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill border border-line",
        "bg-black/20 px-2 py-0.5 text-[11px] text-text",
        className
      )}
      {...props}
    />
  );
}
