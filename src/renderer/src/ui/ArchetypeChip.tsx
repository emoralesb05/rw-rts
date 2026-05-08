import type { ComponentProps } from "react";
import {
  ARCHETYPE_GLYPH,
  ARCHETYPE_LABEL,
  type Archetype,
} from "./role-archetype";
import { cn } from "@/lib/cn";

const ARCHETYPE_CLASS: Record<Archetype, string> = {
  tank: "border-accent/40 bg-accent/10 text-accent",
  healer: "border-success/40 bg-success/10 text-success",
  dps: "border-[#ff7a3c]/40 bg-[#ff7a3c]/10 text-[#ff7a3c]",
  roamer: "border-white/10 bg-transparent text-muted",
};

export type ArchetypeChipProps = ComponentProps<"span"> & {
  archetype: Archetype;
  labeled?: boolean;
};

export function ArchetypeChip({
  archetype,
  className,
  labeled = false,
  ...props
}: ArchetypeChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-4 shrink-0 items-center justify-center rounded-sm border leading-none",
        labeled
          ? "w-auto gap-1 px-1.5 text-[9px] font-bold tracking-[0.4px] uppercase"
          : "w-[18px] text-[10px]",
        ARCHETYPE_CLASS[archetype],
        className
      )}
      aria-label={`Behavior class: ${ARCHETYPE_LABEL[archetype]}`}
      {...props}
    >
      {ARCHETYPE_GLYPH[archetype]}
      {labeled && <span>{ARCHETYPE_LABEL[archetype]}</span>}
    </span>
  );
}
