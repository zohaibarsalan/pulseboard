import { cn } from "../lib/cn.js";

export type Range = "24h" | "7d" | "30d";

export const RANGES: Array<{ value: Range; label: string; days: number; bucket: "hour" | "day" }> = [
  { value: "24h", label: "24h", days: 1, bucket: "hour" },
  { value: "7d", label: "7d", days: 7, bucket: "day" },
  { value: "30d", label: "30d", days: 30, bucket: "day" },
];

type Props = {
  value: Range;
  onChange: (next: Range) => void;
};

export function RangeSelector({ value, onChange }: Props): React.ReactElement {
  return (
    <div className="inline-flex items-center rounded-md border border-border bg-bg-subtle p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.value}
          type="button"
          onClick={() => onChange(r.value)}
          className={cn(
            "rounded px-2.5 py-1 text-2xs font-medium transition-colors",
            value === r.value
              ? "bg-bg text-fg shadow-sm"
              : "text-fg-subtle hover:text-fg",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export function rangeConfig(value: Range): { days: number; bucket: "hour" | "day" } {
  const r = RANGES.find((x) => x.value === value) ?? RANGES[1]!;
  return { days: r.days, bucket: r.bucket };
}
