import type { ComponentProps, ReactElement, ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../primitives/Tooltip";

type TooltipHintProps = Pick<
  ComponentProps<typeof TooltipContent>,
  "align" | "className" | "side" | "sideOffset"
> & {
  label: ReactNode;
  children: ReactElement;
};

export function TooltipHint({
  align,
  children,
  className,
  label,
  side,
  sideOffset,
}: TooltipHintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        align={align}
        className={className}
        side={side}
        sideOffset={sideOffset}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
