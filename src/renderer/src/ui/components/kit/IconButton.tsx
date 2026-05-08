import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type IconButtonVariant = "default" | "ghost" | "danger" | "accent";
type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = ComponentProps<"button"> & {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

export function IconButton({
  className,
  variant = "default",
  size = "md",
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-sm border select-none",
        "focus-visible:border-accent transition-colors focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "size-6",
        size === "md" && "size-7",
        size === "lg" && "size-8",
        variant === "default" &&
          "border-line bg-surface-2 text-text hover:border-accent",
        variant === "ghost" &&
          "text-muted hover:border-line hover:text-text border-transparent bg-transparent",
        variant === "danger" &&
          "border-danger/50 bg-danger/10 text-danger hover:border-danger",
        variant === "accent" &&
          "border-accent/60 bg-accent/15 text-accent hover:border-accent",
        className
      )}
      {...props}
    />
  );
}
