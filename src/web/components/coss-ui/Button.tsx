import { forwardRef } from "react";
import { cn } from "../../lib/cn.js";

type ButtonVariant = "default" | "outline" | "ghost" | "danger" | "pill";
type ButtonSize = "xs" | "sm" | "md" | "icon";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  active?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: "border-border bg-fg text-bg hover:bg-fg/90",
  outline: "border-border bg-bg hover:bg-bg-muted",
  ghost: "border-transparent bg-transparent text-fg-subtle hover:bg-bg-muted hover:text-fg",
  danger: "border-transparent bg-transparent text-fg-subtle hover:bg-[hsl(var(--danger-bg))] hover:text-danger",
  pill: "border-transparent bg-transparent text-fg-muted hover:bg-bg-muted data-[active=true]:bg-fg/10 data-[active=true]:text-fg",
};

const sizeClasses: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 px-2 text-2xs",
  sm: "h-7 gap-1.5 px-2 text-xs",
  md: "h-8 gap-1.5 px-2.5 text-xs",
  icon: "h-8 w-8 justify-center p-0",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ active, className, variant = "outline", size = "md", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-active={active ? "true" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  ),
);

Button.displayName = "Button";
