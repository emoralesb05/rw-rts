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
        "select-none border px-3 py-1.5 text-xs font-semibold transition-colors",
        "focus:outline-none focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100",
        variant === "default" &&
          "border-line bg-surface-2 text-text hover:border-accent",
        variant === "primary" &&
          "border-accent bg-accent text-bg hover:brightness-110",
        variant === "gold" &&
          "border-accent-alt bg-accent-alt text-bg hover:brightness-110",
        variant === "ghost" &&
          "border-transparent bg-transparent text-muted hover:border-line hover:text-text",
        variant === "danger" &&
          "border-danger/60 bg-danger/15 text-danger hover:border-danger",
        className
      )}
      {...props}
    />
  );
}
