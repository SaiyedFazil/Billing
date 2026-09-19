import type { NextAuthConfig } from "next-auth";

/**
 * The edge-safe half of the Auth.js configuration.
 *
 * Deliberately imports nothing from the database or bcrypt: `proxy.ts` runs on
 * the edge runtime, where the Neon Pool cannot open a connection. The full
 * config in `auth.ts` adds the credentials provider on top of this.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // One shift.
    maxAge: 8 * 60 * 60,
  },
  providers: [],
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
} satisfies NextAuthConfig;
