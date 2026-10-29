import type { Role } from "@/constants/roles";

import type { SessionUser } from "./guard";

/**
 * The rules that decide whether a session cookie still counts. Pure — no
 * database, no Next.js — so the proxy, `auth.ts` and the guard share one
 * copy, and `scripts/verify-auth.ts` proves them without a server.
 */

/** What the session cookie says about its user, fixed at sign-in. */
export type SessionClaims = {
  id: string;
  sessionVersion: number;
};

/** The same user as the database has them now. */
export type SessionUserRecord = {
  id: string;
  name: string;
  username: string;
  role: Role;
  isActive: boolean;
  sessionVersion: number;
};

/**
 * The user a session belongs to, or null when the owner has ended it since
 * sign-in: the account was deactivated, or its session version has moved on
 * (a password reset). Name and role come from the database rather than the
 * cookie, so a change takes effect on the next request.
 */
export function currentSessionUser(
  claims: SessionClaims,
  record: SessionUserRecord | undefined,
): SessionUser | null {
  if (!record || record.id !== claims.id || !record.isActive) return null;
  if (record.sessionVersion !== claims.sessionVersion) return null;

  return {
    id: record.id,
    name: record.name,
    username: record.username,
    role: record.role,
  };
}

/**
 * Whether Auth.js names the session cookie `__Secure-…`. It decides by
 * AUTH_URL when that is set and by the request's own URL otherwise, so
 * anything reading the cookie by hand must decide the same way.
 */
export function usesSecureCookie(
  authUrl: string | undefined,
  requestUrl: string,
): boolean {
  return (authUrl || requestUrl).startsWith("https://");
}
