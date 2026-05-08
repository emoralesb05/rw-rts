import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Code({ className, ...props }: ComponentProps<"code">) {
  return (
    <code
      className={cn(
        "text-text rounded-sm bg-white/5 px-1 py-0.5 font-mono text-[0.95em]",
        className
      )}
      {...props}
    />
  );
}
