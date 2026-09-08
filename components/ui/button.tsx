import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "inline-flex items-center justify-center gap-2.5 rounded-lg bg-primary px-[18px] py-3 font-semibold text-primary-foreground hover:bg-primary/90",
        secondary:
          "inline-flex items-center justify-center gap-2.5 rounded-lg border border-border bg-white px-[18px] py-3 font-semibold text-foreground hover:bg-accent",
        destructive:
          "inline-flex items-center justify-center gap-2.5 rounded-lg bg-destructive px-[18px] py-3 font-semibold text-white hover:bg-destructive/90",
        ghost:
          "inline-flex items-center justify-center rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground",
        link: "inline-flex items-center gap-[5px] p-1 text-xs text-[#7d8870] hover:text-primary",
        plain: "",
      },
      size: { default: "", icon: "size-[30px] p-0", sm: "px-3 py-2 text-xs" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);
export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, type = "button", ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        data-slot="button"
        type={asChild ? undefined : type}
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
export { Button, buttonVariants };
