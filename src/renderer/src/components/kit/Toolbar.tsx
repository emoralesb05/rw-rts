import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export function Toolbar({
  className,
  role,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("inline-flex items-center gap-1.5", className)}
      role={role ?? "toolbar"}
      {...props}
    />
  );
}
