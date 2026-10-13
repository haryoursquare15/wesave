// Safe automatic retry for the products service when it briefly can't start
// (gateway 502/503/504) or the network drops. Only actions that cannot move
// money twice are retried: reads/status checks, or requests carrying an
// idempotency key / reference that the server de-duplicates.

export const GATEWAY_STATUSES = new Set([502, 503, 504]);
export const PRODUCTS_UNAVAILABLE_MESSAGE =
  "We couldn't reach Vestara just now. Please try again in a moment.";

const SAFE_ACTION = /^(get_|list_|check_|fetch_|lookup_|validate_|preview_|quote_|search_)/;

export function isRetrySafe(action: string, body: Record<string, unknown> = {}): boolean {
  if (SAFE_ACTION.test(action)) return true;
  return Boolean(body.idempotency_key || body.idempotencyKey || body.reference || body.client_reference);
}

export const retryDelay = (attempt: number) =>
  new Promise((r) => setTimeout(r, 400 * (attempt + 1)));

/** Retry a supabase-js functions.invoke call for safe actions on gateway errors. */
export async function invokeWithGatewayRetry<T>(
  action: string,
  body: Record<string, unknown>,
  run: () => Promise<{ data: T; error: unknown }>,
): Promise<{ data: T; error: unknown }> {
  const attempts = isRetrySafe(action, body) ? 3 : 1;
  let last: { data: T; error: unknown } = { data: null as T, error: null };
  for (let i = 0; i < attempts; i++) {
    try {
      last = await run();
      const status = (last.error as { context?: { status?: number } } | null)?.context?.status;
      if (!last.error || !status || !GATEWAY_STATUSES.has(status)) return last;
    } catch (e) {
      last = { data: null as T, error: e };
    }
    if (i < attempts - 1) await retryDelay(i);
  }
  return last;
}
