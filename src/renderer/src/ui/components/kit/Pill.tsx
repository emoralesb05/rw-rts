import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Pill({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "rounded-pill border-line inline-flex items-center gap-1 border",
        "text-text bg-black/20 px-2 py-0.5 text-[11px]",
        className
      )}
      {...props}
    />
  );
}
