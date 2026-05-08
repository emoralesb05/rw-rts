import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogPortal = AlertDialogPrimitive.Portal;

export function AlertDialogOverlay({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-[var(--z-modal)] bg-bg/80 backdrop-blur-[2px]",
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-[calc(var(--z-modal)+1)]",
          "w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2",
          "rounded-md border border-line bg-surface-1 p-4 text-text shadow-2xl",
          "focus:outline-none",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

export function AlertDialogHeader({
  className,
  ...props
}: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-2", className)} {...props} />;
}

export function AlertDialogFooter({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("mt-4 flex justify-end gap-2", className)}
      {...props}
    />
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      className={cn("text-sm font-semibold text-text", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      className={cn("text-xs leading-relaxed text-muted", className)}
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-sm border",
        "border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-text",
        "transition-colors hover:border-accent focus:outline-none",
        "focus-visible:border-accent",
        className
      )}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  ...props
}: ComponentProps<typeof AlertDialogPrimitive.Action>) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(
        "inline-flex min-h-8 items-center justify-center rounded-sm border",
        "border-danger/60 bg-danger/15 px-3 py-1.5 text-xs font-semibold",
        "text-danger transition-colors hover:border-danger focus:outline-none",
        "focus-visible:border-accent",
        className
      )}
      {...props}
    />
  );
}
