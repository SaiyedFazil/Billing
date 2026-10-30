import { createHmac } from "node:crypto";

/**
 * A fingerprint of a user's password hash. It goes into the session cookie at
 * sign-in and is compared with the database on every request, so a password
 * reset — which changes the hash — ends every session from before it, with
 * no column to keep in step. (Django ends sessions the same way.)
 *
 * Keyed with AUTH_SECRET: the cookie's holder can read it through
 * /api/auth/session, and without the key it says nothing about the password.
 */
export function passwordStamp(
  passwordHash: string,
  secret = process.env.AUTH_SECRET,
): string {
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return createHmac("sha256", secret)
    .update(passwordHash)
    .digest("base64url")
    .slice(0, 22);
}
