export type ForwardResult = {
  status: number | null;
  durationMs: number;
  error: string | null;
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
  body: string | null;
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
    });

    return {
      status: res.status,
      durationMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? `Timed out after ${opts.timeoutMs}ms`
          : err.message
        : String(err);
    return {
      status: null,
      durationMs: Date.now() - start,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
