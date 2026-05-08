import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type RenownTier = "New" | "Apprentice" | "Veteran" | "Hero";

const RENOWN_CLASS: Record<RenownTier, string> = {
  New: "border-muted/30 text-muted",
  Apprentice: "border-accent/45 bg-accent/[0.06] text-accent",
  Veteran: "border-[#c9a4ff]/50 bg-[#c9a4ff]/[0.06] text-[#c9a4ff]",
  Hero: "border-accent-alt/65 bg-accent-alt/[0.08] text-accent-alt",
};

export type RenownBadgeProps = ComponentProps<"span"> & {
  stars?: string;
  tier: RenownTier;
};

export function RenownBadge({
  className,
  stars,
  tier,
  ...props
}: RenownBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-sm border px-1.5 py-px",
        "font-mono text-[9px] leading-none tracking-[0.6px]",
        RENOWN_CLASS[tier],
        className
      )}
      {...props}
    >
      {stars && <span className="text-[8.5px] tracking-normal">{stars}</span>}
      <span className="font-bold uppercase">{tier}</span>
    </span>
  );
}
