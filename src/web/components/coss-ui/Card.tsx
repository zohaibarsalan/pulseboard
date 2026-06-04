import { cn } from "../../lib/cn.js";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <section className={cn("pb-card p-4", className)} {...props} />;
}

export function CardHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>): React.ReactElement {
  return <div className={cn("mb-3 flex items-center gap-2", className)} {...props} />;
}
