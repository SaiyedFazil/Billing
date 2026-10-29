import { sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { AUTH_ROUTES } from "@/lib/routes/auth-routes";
import { loginSchema } from "@/lib/validation/user-schema";
import {
  clearFailedLogins,
  registerFailedLogin,
} from "@/server/users/login-attempts";

export const { handlers, auth, signIn, signOut } = NextAuth({
  pages: {
    signIn: AUTH_ROUTES.login,
  },
  session: {
    strategy: "jwt",
    // One shift.
    maxAge: 8 * 60 * 60,
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.username = token.username;
      session.user.role = token.role;
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

        // Every failure path returns the same null. Never reveal which check
        // failed — that is how username enumeration starts.
        if (!user) return null;
        if (!user.isActive) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          await registerFailedLogin(username);
          return null;
        }

        if (user.failedAttempts > 0 || user.lockedUntil) {
          await clearFailedLogins(user.id);
        }

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
});
