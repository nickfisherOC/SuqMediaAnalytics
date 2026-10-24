/**
 * fetch with retries for rate limits and server errors (exponential backoff
 * with jitter). Every connector goes through this.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit = {},
  opts: { retries?: number; isRateLimited?: (status: number, body: unknown) => boolean } = {},
): Promise<{ status: number; body: T }> {
  const retries = opts.retries ?? 4;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const text = await res.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    const limited = res.status === 429 || opts.isRateLimited?.(res.status, body);
    if ((limited || res.status >= 500) && attempt < retries) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const wait = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => setTimeout(r, Math.min(wait, 20_000)));
      continue;
    }
    return { status: res.status, body: body as T };
  }
}
