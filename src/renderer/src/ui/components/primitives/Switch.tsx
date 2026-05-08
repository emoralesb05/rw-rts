import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Switch = SwitchPrimitive.Root;

export function SwitchControl({
  className,
  ...props
}: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center",
        "rounded-pill border border-line bg-surface-2 transition-colors",
        "data-[state=checked]:border-accent data-[state=checked]:bg-accent/35",
        "focus:outline-none focus-visible:border-accent",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-4 rounded-pill bg-text shadow transition-transform",
          "data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5"
        )}
      />
    </SwitchPrimitive.Root>
  );
}
