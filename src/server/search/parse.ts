export type ComparisonOp = ">" | "<" | ">=" | "<=" | "=";

export type ParsedQuery = {
  status?: string;
  queue?: string;
  name?: string;
  id?: string;
  reasonContains?: string;
  errorHashPrefix?: string;
  attempts?: { op: ComparisonOp; value: number };
  freeText: string[];
};

const TOKEN_RE = /"([^"]+)"|(\S+)/g;
const FIELD_RE = /^([a-z]+):(.*)$/i;
const COMPARISON_RE = /^(>=|<=|>|<|=)(.+)$/;

const KNOWN_STATUSES = new Set([
  "waiting",
  "active",
  "completed",
  "failed",
  "delayed",
  "paused",
  "stalled",
  "waiting-children",
]);

export function parseQuery(input: string): ParsedQuery {
  const out: ParsedQuery = { freeText: [] };
  if (!input.trim()) return out;

  for (const token of tokenize(input)) {
    const fieldMatch = FIELD_RE.exec(token.raw);
    if (!fieldMatch || token.quoted) {
      out.freeText.push(token.value);
      continue;
    }
    const field = fieldMatch[1]!.toLowerCase();
    const rest = fieldMatch[2] ?? "";
    applyField(out, field, rest);
  }

  return out;
}

type Token = { raw: string; value: string; quoted: boolean };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(input)) !== null) {
    const quoted = match[1] !== undefined;
    const value = (quoted ? match[1] : match[2])!;
    tokens.push({ raw: match[0], value, quoted });
  }
  return tokens;
}

function applyField(out: ParsedQuery, field: string, rest: string): void {
  const stripped = stripQuotes(rest);
  switch (field) {
    case "status": {
      const v = stripped.toLowerCase();
      if (KNOWN_STATUSES.has(v)) out.status = v;
      else out.freeText.push(`${field}:${stripped}`);
      return;
    }
    case "queue":
      if (stripped) out.queue = stripped;
      return;
    case "name":
      if (stripped) out.name = stripped;
      return;
    case "id":
    case "jobid":
      if (stripped) out.id = stripped;
      return;
    case "reason":
    case "error":
      if (stripped) out.reasonContains = stripped;
      return;
    case "hash":
    case "errorhash":
      if (stripped) out.errorHashPrefix = stripped;
      return;
    case "attempts": {
      const cmp = COMPARISON_RE.exec(stripped);
      if (cmp) {
        const op = cmp[1] as ComparisonOp;
        const n = Number(cmp[2]);
        if (Number.isFinite(n)) out.attempts = { op, value: n };
        return;
      }
      const n = Number(stripped);
      if (Number.isFinite(n)) out.attempts = { op: "=", value: n };
      return;
    }
    default:
      out.freeText.push(`${field}:${stripped}`);
  }
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  return s;
}

export function isEmpty(p: ParsedQuery): boolean {
  return (
    !p.status &&
    !p.queue &&
    !p.name &&
    !p.id &&
    !p.reasonContains &&
    !p.errorHashPrefix &&
    !p.attempts &&
    p.freeText.length === 0
  );
}
