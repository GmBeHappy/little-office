import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Label } from "./label";
export function Field({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="field"
      className={cn("form-field flex min-w-0 flex-col gap-2", className)}
      {...props}
    />
  );
}
export function FieldLabel({
  className,
  ...props
}: ComponentProps<typeof Label>) {
  return (
    <Label
      className={cn("m-0 text-[13px] font-semibold leading-5", className)}
      {...props}
    />
  );
}
export function FieldDescription({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("text-xs leading-relaxed text-muted-foreground", className)}
      {...props}
    />
  );
}
export function FieldError({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      role="alert"
      className={cn(
        "text-xs font-medium leading-relaxed text-destructive",
        className,
      )}
      {...props}
    />
  );
}
