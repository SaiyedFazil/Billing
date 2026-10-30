import type { Role } from "@/constants/roles";

import type { SessionUser } from "./guard";

/**
 * The rules that decide whether a session cookie still counts. Pure — no
 * database, no Next.js — so the proxy, `auth.ts` and the guard share one
 * copy, and `scripts/verify-auth.ts` proves them without a server.
 */

/** How long a sign-in lasts — one long shift, counted from sign-in. */
export const SESSION_MAX_AGE_SECONDS = 10 * 60 * 60;

/**
 * Whether a session has outlived its sign-in, given the sign-in time stored
 * in the token (epoch seconds). Auth.js re-issues the cookie with a fresh
 * expiry whenever `/api/auth/session` is read, so the cookie's own expiry
 * cannot hold a session to a fixed length; the sign-in time inside it can. A
 * token without one predates this rule and counts as ended.
 */
export function hasOutlivedSignIn(
  signedInAt: unknown,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  return (
    typeof signedInAt !== "number" ||
    nowSeconds - signedInAt >= SESSION_MAX_AGE_SECONDS
  );
}

/** What the session cookie says about its user, fixed at sign-in. */
export type SessionClaims = {
  id: string;
  /** passwordStamp() of the password hash at sign-in. */
  passwordStamp: string;
};

/** The same user as the database has them now. */
export type SessionUserRecord = {
  id: string;
  name: string;
  username: string;
  role: Role;
  /** False once the owner has deleted the account. */
  isActive: boolean;
  /** passwordStamp() of the password hash now. */
  passwordStamp: string;
};

/**
 * The user a session belongs to, or null when it has ended since sign-in:
 * the owner deleted the account, or its password has changed (a reset), so
 * the stamp in the cookie no longer matches. Name and role come from the
 * database rather than the cookie, so a change takes effect on the next
 * request.
 */
export function currentSessionUser(
  claims: SessionClaims,
  record: SessionUserRecord | undefined,
): SessionUser | null {
  if (!record || record.id !== claims.id || !record.isActive) return null;
  if (record.passwordStamp !== claims.passwordStamp) return null;

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
