import { sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { AccountLocked } from "@/lib/auth/sign-in-errors";
import {
  hasOutlivedSignIn,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth/session-policy";
import { AUTH_ROUTES } from "@/lib/routes/auth-routes";
import { loginSchema } from "@/lib/validation/user-schema";
import {
  claimSignInAttempt,
  clearFailedLogins,
} from "@/server/users/login-attempts";

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: AUTH_ROUTES.login,
  },
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.username = user.username;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
        token.signedInAt = Math.floor(Date.now() / 1000);
      }
      // null ends the session: auth() returns none, so the guards reject it.
      if (hasOutlivedSignIn(token.signedInAt)) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.username = token.username;
      session.user.role = token.role;
      session.user.sessionVersion = token.sessionVersion;
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;

        const user = await db.query.users.findFirst({
          where: sql`lower(${users.username}) = lower(${username})`,
        });

        // A wrong password, an unknown username and a deactivated account
        // all return the same null and cost one bcrypt check, so neither the
        // answer nor its timing reveals which it was — that is how username
        // enumeration starts.
        if (!user || !user.isActive) {
          await verifyPassword(password, null);
          return null;
        }

        const attempt = await claimSignInAttempt(user.id);
        const valid = await verifyPassword(password, user.passwordHash);

        if (attempt.allowed && valid) {
          await clearFailedLogins(user.id);
        } else if (attempt.lockedUntil) {
          // A lock is said out loud, even though only real accounts lock:
          // staff who are told "incorrect password" keep retrying a locked
          // account. Five wrong guesses are needed before this appears.
          throw new AccountLocked(attempt.lockedUntil);
        } else {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
