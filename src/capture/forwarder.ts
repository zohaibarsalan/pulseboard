export type ForwardResult = {
  target: string;
  status: number | null;
  durationMs: number;
  error: string | null;
  responseHeaders: Record<string, string>;
  responseBody: string | null;
  responseContentType: string | null;
  responseBodyTruncated: boolean;
};

// Headers we must not copy through: hop-by-hop headers and ones the runtime
// will set correctly itself. Notably we DROP host (it must reflect the target)
// but KEEP every signature header so HMAC validation on the user's app passes.
const SKIP_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "proxy-authorization",
  "proxy-authenticate",
  "te",
  "trailer",
]);

export async function forwardWebhook(opts: {
  forwardTo: string;
  method: string;
  path: string;
  queryParams: string | null;
  headers: Record<string, string>;
  /** The exact raw body bytes as received — never re-serialized. */
  body: string | Buffer | null;
  timeoutMs: number;
}): Promise<ForwardResult> {
  const start = Date.now();

  // Append the captured path + query onto the forward base so the user's app
  // sees the same route it would have from the provider.
  const base = opts.forwardTo.replace(/\/$/, "");
  const query = opts.queryParams ? `?${opts.queryParams}` : "";
  const target = `${base}${opts.path}${query}`;

  const forwardHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(opts.headers)) {
    if (!SKIP_HEADERS.has(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

  try {
    const res = await fetch(target, {
      method: opts.method,
      headers: forwardHeaders,
      body: opts.method === "GET" || opts.method === "HEAD" ? undefined : opts.body,
      signal: controller.signal,
      // Do not allow an approved target to redirect the server-side request to
      // an unapproved host (for example, a cloud metadata endpoint).
      redirect: "manual",
    });
    const responseHeaders = Object.fromEntries(res.headers.entries());
    const response = await readResponsePreview(res, 64 * 1024);

    return {
      target: opts.forwardTo,
      status: res.status,
      durationMs: Date.now() - start,
      error: null,
      responseHeaders,
      responseBody: response.body,
      responseContentType: res.headers.get("content-type"),
      responseBodyTruncated: response.truncated,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timed out after ${opts.timeoutMs}ms`
          : err.message
        : String(err);
    return {
      target: opts.forwardTo,
      status: null,
      durationMs: Date.now() - start,
      error: message,
      responseHeaders: {},
      responseBody: null,
      responseContentType: null,
      responseBodyTruncated: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponsePreview(
  response: Response,
  limit: number,
): Promise<{ body: string | null; truncated: boolean }> {
  if (!response.body) return { body: null, truncated: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const remaining = limit - total;
    if (remaining <= 0) {
      truncated = true;
      await reader.cancel();
      break;
    }
    if (value.byteLength > remaining) {
      chunks.push(value.subarray(0, remaining));
      total += remaining;
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  if (total === 0) return { body: null, truncated };
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { body: new TextDecoder().decode(bytes), truncated };
}
