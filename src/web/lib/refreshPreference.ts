export type WebhookRefreshInterval = number;

export const WEBHOOK_REFRESH_KEY = "pb-webhook-refresh-interval";
export const DEFAULT_WEBHOOK_REFRESH_INTERVAL = 30_000;
export const MIN_WEBHOOK_REFRESH_INTERVAL = 5_000;
export const MAX_WEBHOOK_REFRESH_INTERVAL = 3_600_000;

export const WEBHOOK_REFRESH_PRESETS = [
  5_000,
  10_000,
  30_000,
  60_000,
  300_000,
] as const;

export const WEBHOOK_REFRESH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "5000", label: "Every 5 seconds" },
  { value: "10000", label: "Every 10 seconds" },
  { value: "30000", label: "Every 30 seconds" },
  { value: "60000", label: "Every minute" },
  { value: "300000", label: "Every 5 minutes" },
  { value: "custom", label: "Custom interval…" },
  { value: "0", label: "Manual only" },
];

export function getWebhookRefreshInterval(): WebhookRefreshInterval {
  const stored = localStorage.getItem(WEBHOOK_REFRESH_KEY);
  if (stored == null) return DEFAULT_WEBHOOK_REFRESH_INTERVAL;
  const value = Number(stored);
  if (value === 0) return value;
  return Number.isFinite(value) &&
    value >= MIN_WEBHOOK_REFRESH_INTERVAL &&
    value <= MAX_WEBHOOK_REFRESH_INTERVAL
    ? Math.round(value / 1_000) * 1_000
    : DEFAULT_WEBHOOK_REFRESH_INTERVAL;
}

export function setWebhookRefreshInterval(value: WebhookRefreshInterval): void {
  localStorage.setItem(WEBHOOK_REFRESH_KEY, String(value));
}

export function isWebhookRefreshPreset(value: number): boolean {
  return WEBHOOK_REFRESH_PRESETS.some((preset) => preset === value);
}

export function formatWebhookRefreshInterval(value: number): string {
  const seconds = value / 1_000;
  if (seconds < 60) return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  const minutes = seconds / 60;
  return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
}
