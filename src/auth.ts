import { sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/validation/user-schema";
import {
  clearFailedLogins,
  registerFailedLogin,
} from "@/server/users/login-attempts";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
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
