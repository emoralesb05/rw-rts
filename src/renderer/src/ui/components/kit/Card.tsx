import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "border-line bg-surface-1 text-text rounded-md border shadow-xl",
        className
      )}
      {...props}
    />
  );
}
