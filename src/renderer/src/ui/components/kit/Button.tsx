import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type ButtonVariant = "default" | "primary" | "gold" | "ghost" | "danger";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
};

export function Button({
  className,
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-8 items-center justify-center gap-1.5 rounded-sm",
        "border px-3 py-1.5 text-xs font-semibold transition-colors select-none",
        "focus-visible:border-accent focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100",
        variant === "default" &&
          "border-line bg-surface-2 text-text hover:border-accent",
        variant === "primary" &&
          "border-accent bg-accent text-bg hover:brightness-110",
        variant === "gold" &&
          "border-accent-alt bg-accent-alt text-bg hover:brightness-110",
        variant === "ghost" &&
          "text-muted hover:border-line hover:text-text border-transparent bg-transparent",
        variant === "danger" &&
          "border-danger/60 bg-danger/15 text-danger hover:border-danger",
        className
      )}
      {...props}
    />
  );
}
