import type React from "react";
import { cn } from "../lib/cn.js";

type Props = {
  className?: string;
};

export function PulseboardMark({ className }: Props): React.ReactElement {
  return (
    <svg
      aria-hidden="true"
      className={cn("size-8 shrink-0", className)}
      viewBox="0 0 32 32"
      fill="none"
    >
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#111214" stroke="#303236" />
      <path
        d="M10 24V8H17C20.314 8 23 10.686 23 14C23 17.314 20.314 20 17 20H10"
        stroke="#F7F7F5"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6 16H10.5L12.25 12.5L14.75 19.5L17 15L18.25 16H26"
        stroke="#12C98D"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
