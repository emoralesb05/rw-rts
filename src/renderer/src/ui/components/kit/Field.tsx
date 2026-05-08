import type { ComponentProps, ReactNode } from "react";
import { Label } from "../primitives/Label";
import { cn } from "@/lib/cn";

export type FieldProps = ComponentProps<"div"> & {
  label?: ReactNode;
  htmlFor?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
};

export function Field({
  className,
  label,
  htmlFor,
  description,
  error,
  required,
  children,
  ...props
}: FieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} {...props}>
      {(label || description) && (
        <div className="flex flex-col gap-0.5">
          {label && (
            <Label htmlFor={htmlFor}>
              {label}
              {required && <span className="text-danger ml-1">*</span>}
            </Label>
          )}
          {description && (
            <div className="text-muted text-[11px] leading-snug">
              {description}
            </div>
          )}
        </div>
      )}
      {children}
      {error && (
        <div role="alert" className="text-danger text-[11px] leading-snug">
          {error}
        </div>
      )}
    </div>
  );
}
