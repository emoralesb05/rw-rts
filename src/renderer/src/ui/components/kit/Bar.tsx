import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

type BarTone = "hp" | "mp" | "focus" | "danger";

export type BarProps = HTMLAttributes<HTMLDivElement> & {
  max?: number;
  min?: number;
  value: number;
  tone?: BarTone;
};

export function Bar({
  "aria-valuemax": ariaValueMax,
  "aria-valuemin": ariaValueMin,
  "aria-valuenow": ariaValueNow,
  className,
  max = 100,
  min = 0,
  role,
  tone = "hp",
  value,
  ...props
}: BarProps) {
  const clamped = Math.max(min, Math.min(max, value));
  const percent = max === min ? 0 : ((clamped - min) / (max - min)) * 100;
  return (
    <div
      className={cn(
        "rounded-pill h-1.5 overflow-hidden bg-black/30",
        className
      )}
      role={role ?? "meter"}
      aria-valuemax={ariaValueMax ?? max}
      aria-valuemin={ariaValueMin ?? min}
      aria-valuenow={ariaValueNow ?? Math.round(clamped)}
      {...props}
    >
      <div
        className={cn(
          "rounded-pill h-full transition-[width]",
          tone === "hp" && "bg-success",
          tone === "mp" && "bg-accent",
          tone === "focus" && "bg-accent-alt",
          tone === "danger" && "bg-danger"
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
