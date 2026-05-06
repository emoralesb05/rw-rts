import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BarTone = "hp" | "mp" | "focus" | "danger";

export type BarProps = HTMLAttributes<HTMLDivElement> & {
  value: number;
  tone?: BarTone;
};

export function Bar({ value, tone = "hp", className, ...props }: BarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 overflow-hidden rounded-pill bg-black/30", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-pill transition-[width]",
          tone === "hp" && "bg-success",
          tone === "mp" && "bg-accent",
          tone === "focus" && "bg-accent-alt",
          tone === "danger" && "bg-danger"
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
