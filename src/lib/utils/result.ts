export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRICE_CHANGED"
  | "OUT_OF_STOCK"
  | "DB_UNAVAILABLE"
  | "LOCKED"
  | "UNKNOWN";

export type ActionError = {
  code: ErrorCode;
  message: string;
  /** Field-level messages, keyed by form field name. */
  fields?: Record<string, string>;
};

/**
 * Every server action returns this. Actions never throw at the browser, and
 * never leak a stack trace, SQL, or a connection string. See spec §11.1.
 */
export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error: { code, message, fields } };
}
