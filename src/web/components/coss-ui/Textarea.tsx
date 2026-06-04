import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "w-full resize-y rounded-lg border border-border bg-bg-muted/40 p-3 text-sm text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-1 focus:ring-fg",
        className,
      )}
      {...props}
    />
  ),
);

Textarea.displayName = "Textarea";
