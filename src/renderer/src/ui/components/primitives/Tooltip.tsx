import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "border-line z-[var(--z-popover)] max-w-72 rounded-sm border",
          "bg-surface-2 text-text px-2 py-1 text-[11px] leading-snug shadow-xl",
          className
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
