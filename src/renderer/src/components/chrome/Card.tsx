import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-md border border-line bg-surface-1 text-text shadow-xl",
        className
      )}
      {...props}
    />
  );
}
