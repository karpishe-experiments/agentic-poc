import * as React from "react";
import { cn } from "../../lib/utils";
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(({ className, ...props }, ref) => <input ref={ref} className={cn("flex h-10 w-full rounded-xl border border-[#ddcfbd] bg-white px-3 py-2 text-sm text-[#3e3a34] outline-none placeholder:text-[#8c887f] focus:border-[#e76f51] focus:ring-2 focus:ring-[#f8d7c9]", className)} {...props} />);
Input.displayName = "Input";
export { Input };
