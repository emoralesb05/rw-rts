import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Chip({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-sm",
        "border border-line bg-black/20 text-muted transition-colors",
        "hover:border-accent hover:text-accent",
        "focus:outline-none focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className
      )}
      {...props}
    />
  );
}
