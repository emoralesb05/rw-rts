import * as ToastPrimitive from "@radix-ui/react-toast";
import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const ToastProvider = ToastPrimitive.Provider;
export const ToastAction = ToastPrimitive.Action;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed right-4 top-4 z-[calc(var(--z-modal)+20)] flex w-[min(360px,calc(100vw-32px))]",
        "max-h-[calc(100vh-32px)] flex-col gap-2 outline-none",
        className
      )}
      {...props}
    />
  );
}

export function Toast({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Root>) {
  return (
    <ToastPrimitive.Root
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1",
        "rounded-md border border-line bg-surface-1/95 p-3 text-text shadow-2xl",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)]",
        "data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
        "data-[swipe=move]:transition-none",
        className
      )}
      {...props}
    />
  );
}

export function ToastTitle({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Title>) {
  return (
    <ToastPrimitive.Title
      className={cn("text-xs font-semibold text-text", className)}
      {...props}
    />
  );
}

export function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Description>) {
  return (
    <ToastPrimitive.Description
      className={cn("text-[11px] leading-relaxed text-muted", className)}
      {...props}
    />
  );
}

export function ToastClose({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Close>) {
  return (
    <ToastPrimitive.Close
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-sm border",
        "border-transparent text-muted transition-colors hover:border-line hover:text-text",
        "focus:outline-none focus-visible:border-accent",
        className
      )}
      {...props}
    >
      <X size={13} aria-hidden />
      <span className="sr-only">close notification</span>
    </ToastPrimitive.Close>
  );
}
