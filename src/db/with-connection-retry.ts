/**
 * Error codes meaning "the connection never opened", so nothing executed and
 * retrying cannot duplicate work. Anything else propagates untouched.
 */
const RETRYABLE = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now — Neon waking from autosuspend
]);

function isConnectionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && RETRYABLE.has(code);
}

/**
 * Wraps a READ that opens its own connection, retrying once on a cold start.
 *
 * Neon suspends idle databases, so the first query of the morning can fail
 * outright rather than merely being slow. See spec §11.4.
 *
 * Do NOT wrap a transaction: a partially-executed transaction must fail
 * loudly rather than silently re-run.
 */
export async function withConnectionRetry<T>(
  run: () => Promise<T>,
  delayMs = 400,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isConnectionFailure(error)) throw error;

    console.warn("Database connection failed; retrying once (cold start?)");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return run();
  }
}
