import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";

export const Checkbox = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type: _type, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        "h-3.5 w-3.5 rounded border-border bg-bg text-fg accent-[hsl(var(--fg))] focus:ring-1 focus:ring-fg",
        className,
      )}
      {...props}
    />
  ),
);

Checkbox.displayName = "Checkbox";
