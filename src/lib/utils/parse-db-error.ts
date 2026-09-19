/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

type PgError = { code?: unknown; constraint?: unknown };

function asPgError(error: unknown): PgError | null {
  if (typeof error !== "object" || error === null) return null;
  return error as PgError;
}

export function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const pg = asPgError(error);
  if (pg?.code !== UNIQUE_VIOLATION) return false;
  if (!constraint) return true;
  return pg.constraint === constraint;
}
