import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex border-b border-line bg-black/20",
        className
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "flex-1 border-0 border-b-2 border-transparent bg-transparent",
        "px-3 py-2 text-[11px] font-semibold uppercase text-muted",
        "transition-colors hover:text-text",
        "data-[state=active]:border-accent data-[state=active]:text-accent",
        "focus:outline-none focus-visible:text-text",
        className
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("focus:outline-none", className)}
      {...props}
    />
  );
}
