import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "h-8 rounded-md border border-border bg-bg px-2.5 text-sm text-fg focus:outline-none focus:ring-1 focus:ring-fg",
        className,
      )}
      {...props}
    />
  ),
);

Select.displayName = "Select";
