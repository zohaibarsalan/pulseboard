export const REDACTED = "[REDACTED]";

export function redact(value: unknown, redactKeys: string[]): unknown {
  if (redactKeys.length === 0) return value;
  const lowercased = redactKeys.map((k) => k.toLowerCase());
  const seen = new WeakSet<object>();
  return walk(value, lowercased, seen);
}

function walk(value: unknown, redactKeys: string[], seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) {
    return value.map((item) => walk(item, redactKeys, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (shouldRedact(key, redactKeys)) {
      out[key] = REDACTED;
    } else {
      out[key] = walk(child, redactKeys, seen);
    }
  }
  return out;
}

function shouldRedact(key: string, redactKeys: string[]): boolean {
  const lower = key.toLowerCase();
  for (const needle of redactKeys) {
    if (lower.includes(needle)) return true;
  }
  return false;
}
