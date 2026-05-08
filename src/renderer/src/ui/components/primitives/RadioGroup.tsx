import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const RadioGroup = RadioGroupPrimitive.Root;

export function RadioGroupItem({
  className,
  ...props
}: ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      className={cn(
        "rounded-pill inline-flex size-4 shrink-0 items-center justify-center",
        "border-line bg-surface-2 border transition-colors",
        "data-[state=checked]:border-accent",
        "focus-visible:border-accent focus:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <RadioGroupPrimitive.Indicator className="rounded-pill bg-accent size-2" />
    </RadioGroupPrimitive.Item>
  );
}
