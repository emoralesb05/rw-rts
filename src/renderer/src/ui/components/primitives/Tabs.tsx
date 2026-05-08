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
      className={cn("border-line flex border-b bg-black/20", className)}
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
        "text-muted px-3 py-2 text-[11px] font-semibold uppercase",
        "hover:text-text transition-colors",
        "data-[state=active]:border-accent data-[state=active]:text-accent",
        "focus-visible:text-text focus:outline-none",
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
