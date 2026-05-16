import { createHash } from "node:crypto";

const PATH_RE = /(\/[A-Za-z0-9_./@\-+]+)+/g;
const LINE_COL_RE = /:\d+:\d+/g;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_ID_RE = /\b[0-9a-f]{16,}\b/gi;
const NUMERIC_ID_RE = /\b\d{6,}\b/g;
const ISO_TS_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g;
const CHUNK_HASH_RE = /(chunk|index|main|vendor|app)-[A-Za-z0-9_]{6,}\.(js|mjs|cjs|css)/gi;
const PNPM_PATH_RE = /node_modules\/\.pnpm\/[^/]+\/node_modules\//g;

function normalize(s: string): string {
  return s
    .replace(ISO_TS_RE, "<ts>")
    .replace(UUID_RE, "<uuid>")
    .replace(HEX_ID_RE, "<hex>")
    .replace(PNPM_PATH_RE, "node_modules/")
    .replace(CHUNK_HASH_RE, "$1.$2")
    .replace(LINE_COL_RE, "")
    .replace(PATH_RE, (m) => {
      const segs = m.split("/").filter(Boolean);
      return segs[segs.length - 1] ?? m;
    })
    .replace(NUMERIC_ID_RE, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

function topFrames(stack: string | undefined, n: number): string {
  if (!stack) return "";
  const lines = stack
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("at "));
  return lines.slice(0, n).map(normalize).join("|");
}

export function computeErrorHash(failedReason: string | null | undefined, stack: string | undefined): string | null {
  if (!failedReason && !stack) return null;
  const reason = normalize(failedReason ?? "");
  const frames = topFrames(stack, 5);
  if (!reason && !frames) return null;
  return createHash("sha1").update(`${reason}|${frames}`).digest("hex").slice(0, 16);
}
