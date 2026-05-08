import {
  Command as CommandPrimitive,
  CommandEmpty as CommandPrimitiveEmpty,
  CommandGroup as CommandPrimitiveGroup,
  CommandInput as CommandPrimitiveInput,
  CommandItem as CommandPrimitiveItem,
  CommandList as CommandPrimitiveList,
  CommandLoading as CommandPrimitiveLoading,
  CommandSeparator as CommandPrimitiveSeparator,
} from "cmdk";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Command({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn("text-text flex flex-col overflow-hidden", className)}
      {...props}
    />
  );
}

export function CommandInput({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitiveInput>) {
  return (
    <CommandPrimitiveInput
      className={cn(
        "text-text min-w-0 flex-1 border-0 bg-transparent text-[15px]",
        "placeholder:text-muted/75 focus:outline-none",
        className
      )}
      {...props}
    />
  );
}

export function CommandList({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitiveList>) {
  return (
    <CommandPrimitiveList
      className={cn("max-h-[520px] overflow-y-auto p-1.5", className)}
      {...props}
    />
  );
}

export function CommandEmpty({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitiveEmpty>) {
  return (
    <CommandPrimitiveEmpty
      className={cn(
        "text-muted px-6 py-8 text-center text-xs italic",
        className
      )}
      {...props}
    />
  );
}

export function CommandGroup({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitiveGroup>) {
  return (
    <CommandPrimitiveGroup
      className={cn(
        "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5",
        "[&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold",
        "[&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:uppercase",
        className
      )}
      {...props}
    />
  );
}

export function CommandItem({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitiveItem>) {
  return (
    <CommandPrimitiveItem
      className={cn(
        "grid min-h-12 cursor-pointer grid-cols-[28px_minmax(0,1fr)_auto]",
        "items-center gap-2 rounded-md border border-transparent px-2.5 py-2",
        "text-text text-left outline-none",
        "data-[selected=true]:border-accent/35 data-[selected=true]:bg-accent/10",
        "data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45",
        className
      )}
      {...props}
    />
  );
}

export function CommandSeparator({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitiveSeparator>) {
  return (
    <CommandPrimitiveSeparator
      className={cn("bg-line/70 my-1 h-px", className)}
      {...props}
    />
  );
}

export function CommandLoading({
  className,
  ...props
}: ComponentProps<typeof CommandPrimitiveLoading>) {
  return (
    <CommandPrimitiveLoading
      className={cn("text-muted px-6 py-8 text-center text-xs", className)}
      {...props}
    />
  );
}
