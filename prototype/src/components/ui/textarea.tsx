import * as React from "react";
import { cn } from "../../lib/utils";
const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(({ className, ...props }, ref) => <textarea ref={ref} className={cn("flex min-h-24 w-full resize-none rounded-xl border border-[#ddcfbd] bg-white px-3 py-3 text-sm leading-6 text-[#3e3a34] outline-none placeholder:text-[#8c887f] focus:border-[#e76f51] focus:ring-2 focus:ring-[#f8d7c9]", className)} {...props} />);
Textarea.displayName = "Textarea";
export { Textarea };
