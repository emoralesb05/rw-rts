import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-sm bg-line/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
