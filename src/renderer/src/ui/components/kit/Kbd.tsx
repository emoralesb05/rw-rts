import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "border-line inline-flex min-h-4 items-center rounded-sm border",
        "text-muted bg-black/25 px-1 font-mono text-[10px] font-semibold",
        className
      )}
      {...props}
    />
  );
}
