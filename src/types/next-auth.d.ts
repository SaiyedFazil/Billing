import "next-auth";
import "next-auth/jwt";

import type { Role } from "@/constants/roles";

/**
 * Extends the Auth.js types so the session and token are fully typed in
 * Server Components, Client Components and server actions.
 *
 * Single source of truth — do NOT redeclare these in src/auth.ts.
 *
 * Note the `@auth/core/jwt` block: `next-auth/jwt` only re-exports the JWT
 * interface, so augmenting that path alone does not merge and every token
 * field falls back to `unknown` via JWT's `Record<string, unknown>` base.
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: Role;
      sessionVersion: number;
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    username: string;
    role: Role;
    sessionVersion: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: Role;
    sessionVersion: number;
    /** Epoch seconds. A session ends SESSION_MAX_AGE_SECONDS after it. */
    signedInAt: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: Role;
    sessionVersion: number;
    /** Epoch seconds. A session ends SESSION_MAX_AGE_SECONDS after it. */
    signedInAt: number;
  }
}
