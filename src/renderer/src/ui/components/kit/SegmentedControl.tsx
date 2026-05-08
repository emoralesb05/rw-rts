import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

type SegmentedControlSize = "sm" | "md";

export type SegmentedControlOption = {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

export type SegmentedControlProps = Omit<
  ComponentProps<typeof RadioGroupPrimitive.Root>,
  "children"
> & {
  options: readonly SegmentedControlOption[];
  size?: SegmentedControlSize;
};

export function SegmentedControl({
  className,
  options,
  size = "md",
  ...props
}: SegmentedControlProps) {
  return (
    <RadioGroupPrimitive.Root
      className={cn(
        "border-line bg-surface-2 inline-flex overflow-hidden rounded-md border",
        className
      )}
      {...props}
    >
      {options.map((option) => (
        <RadioGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(
            "inline-flex flex-1 items-center justify-center gap-1.5 border-0 bg-transparent",
            "text-muted font-semibold uppercase transition-colors",
            "data-[state=checked]:bg-accent data-[state=checked]:text-bg",
            "hover:text-text focus-visible:text-text focus:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-45",
            size === "sm" && "min-h-7 px-2 text-[10px]",
            size === "md" && "min-h-8 px-3 text-[11px]"
          )}
        >
          {option.icon}
          {option.label}
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}
