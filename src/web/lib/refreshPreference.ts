export type WebhookRefreshInterval = 0 | 30_000 | 60_000;

export const WEBHOOK_REFRESH_KEY = "pb-webhook-refresh-interval";

export const WEBHOOK_REFRESH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "30000", label: "Every 30 seconds" },
  { value: "60000", label: "Every 60 seconds" },
  { value: "0", label: "Manual only" },
];

export function getWebhookRefreshInterval(): WebhookRefreshInterval {
  const stored = localStorage.getItem(WEBHOOK_REFRESH_KEY);
  if (stored == null) return 30_000;
  const value = Number(stored);
  return value === 0 || value === 60_000 ? value : 30_000;
}

export function setWebhookRefreshInterval(value: WebhookRefreshInterval): void {
  localStorage.setItem(WEBHOOK_REFRESH_KEY, String(value));
}
