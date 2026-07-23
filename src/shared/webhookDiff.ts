export type DiffKind = "added" | "removed" | "changed" | "unchanged";

export type DiffEntry = {
  path: string;
  kind: DiffKind;
  before: string | null;
  after: string | null;
};

export type DiffSummary = Record<DiffKind, number>;

export function diffJsonBodies(beforeBody: string | null, afterBody: string | null): {
  entries: DiffEntry[];
  structured: boolean;
  summary: DiffSummary;
} {
  const before = parseJson(beforeBody);
  const after = parseJson(afterBody);

  if (!before.ok || !after.ok) {
    const entries = diffRecords(
      { "$ body": beforeBody ?? "" },
      { "$ body": afterBody ?? "" },
    );
    return { entries, structured: false, summary: summarizeDiff(entries) };
  }

  const entries = diffRecords(flattenJson(before.value), flattenJson(after.value));
  return { entries, structured: true, summary: summarizeDiff(entries) };
}

export function diffHeaders(
  beforeHeaders: Record<string, string>,
  afterHeaders: Record<string, string>,
): { entries: DiffEntry[]; summary: DiffSummary } {
  const normalize = (headers: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
      Object.entries(headers)
        .map(([key, value]): [string, string] => [key.toLowerCase(), value])
        .sort(([left], [right]) => left.localeCompare(right)),
    );
  const entries = diffRecords(normalize(beforeHeaders), normalize(afterHeaders));
  return { entries, summary: summarizeDiff(entries) };
}

export function summarizeDiff(entries: DiffEntry[]): DiffSummary {
  return entries.reduce<DiffSummary>(
    (summary, entry) => {
      summary[entry.kind] += 1;
      return summary;
    },
    { added: 0, removed: 0, changed: 0, unchanged: 0 },
  );
}

function diffRecords(
  before: Record<string, string>,
  after: Record<string, string>,
): DiffEntry[] {
  const paths = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  return paths.map((path) => {
    const hasBefore = Object.hasOwn(before, path);
    const hasAfter = Object.hasOwn(after, path);
    const beforeValue = hasBefore ? before[path]! : null;
    const afterValue = hasAfter ? after[path]! : null;
    const kind: DiffKind = !hasBefore
      ? "added"
      : !hasAfter
        ? "removed"
        : beforeValue === afterValue
          ? "unchanged"
          : "changed";
    return { path, kind, before: beforeValue, after: afterValue };
  });
}

function flattenJson(value: unknown, path = "$"): Record<string, string> {
  if (Array.isArray(value)) {
    if (value.length === 0) return { [path]: "[]" };
    return Object.assign(
      {},
      ...value.map((entry, index) => flattenJson(entry, `${path}[${index}]`)),
    ) as Record<string, string>;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) return { [path]: "{}" };
    return Object.assign(
      {},
      ...entries.map(([key, entry]) => flattenJson(entry, appendJsonPath(path, key))),
    ) as Record<string, string>;
  }
  return { [path]: JSON.stringify(value) ?? String(value) };
}

function appendJsonPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`;
}

function parseJson(body: string | null): { ok: true; value: unknown } | { ok: false } {
  if (body == null || body.trim() === "") return { ok: false };
  try {
    return { ok: true, value: JSON.parse(body) as unknown };
  } catch {
    return { ok: false };
  }
}
