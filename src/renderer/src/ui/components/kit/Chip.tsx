import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Chip({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-sm",
        "border-line text-muted border bg-black/20 transition-colors",
        "hover:border-accent hover:text-accent",
        "focus-visible:border-accent focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-45",
        className
      )}
      {...props}
    />
  );
}
