import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 rounded-md border border-border bg-bg px-2.5 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-fg",
        className,
      )}
      {...props}
    />
  ),
);

Input.displayName = "Input";
