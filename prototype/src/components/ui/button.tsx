import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e76f51] focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-[#e76f51] text-white shadow-[0_8px_20px_rgba(231,111,81,.22)] hover:bg-[#d95d42]",
        secondary: "bg-[#e6f0ed] text-[#1f5d5c] hover:bg-[#d7e6e2]",
        outline: "border border-[#ddcfbd] bg-white text-[#3e3a34] hover:bg-[#fbf7f0]",
        ghost: "text-[#5c6258] hover:bg-[#f2eadc]",
      },
      size: { default: "h-10 px-4", sm: "h-8 px-3 text-xs", lg: "h-12 px-5 text-base", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
));
Button.displayName = "Button";
export { Button, buttonVariants };
