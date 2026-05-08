import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type EmptyStateProps = ComponentProps<"div"> & {
  title?: ReactNode;
  action?: ReactNode;
};

export function EmptyState({
  className,
  title,
  children,
  action,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-2",
        "rounded-sm bg-black/20 px-4 py-3 text-center text-xs text-muted",
        className
      )}
      {...props}
    >
      {title && <div className="font-semibold text-text">{title}</div>}
      {children && <div className="text-[11px] italic leading-relaxed">{children}</div>}
      {action}
    </div>
  );
}
