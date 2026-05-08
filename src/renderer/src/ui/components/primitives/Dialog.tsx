import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { ComponentProps } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export function DialogOverlay({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "bg-bg/80 fixed inset-0 z-[var(--z-modal)] backdrop-blur-[2px]",
        className
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          "fixed top-1/2 left-1/2 z-[calc(var(--z-modal)+1)]",
          "max-h-[85vh] w-[min(560px,calc(100vw-32px))]",
          "-translate-x-1/2 -translate-y-1/2 overflow-hidden",
          "border-line bg-surface-1 text-text rounded-md border p-5 shadow-2xl",
          "focus:outline-none",
          className
        )}
        {...props}
      >
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export const DialogHeader = ({
  className,
  ...props
}: ComponentProps<"div">) => (
  <div className={cn("flex items-center gap-3", className)} {...props} />
);

export function DialogTitle({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn("text-text text-sm font-semibold", className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted text-xs", className)}
      {...props}
    />
  );
}

export function DialogIconClose({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Close>) {
  return (
    <DialogPrimitive.Close
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-sm",
        "text-muted border border-transparent bg-transparent",
        "hover:border-line hover:text-text transition-colors",
        "focus-visible:border-accent focus:outline-none",
        className
      )}
      {...props}
    >
      <X size={16} aria-hidden />
      <span className="sr-only">close</span>
    </DialogPrimitive.Close>
  );
}
