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
        "text-muted rounded-sm bg-black/20 px-4 py-3 text-center text-xs",
        className
      )}
      {...props}
    >
      {title && <div className="text-text font-semibold">{title}</div>}
      {children && (
        <div className="text-[11px] leading-relaxed italic">{children}</div>
      )}
      {action}
    </div>
  );
}
