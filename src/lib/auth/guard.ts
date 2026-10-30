import { redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";

import { auth } from "@/auth";
import type { Role } from "@/constants/roles";
import { AUTH_ROUTES } from "@/lib/routes/auth-routes";
import { type ActionResult, type ErrorCode, fail } from "@/lib/utils/result";
import { findSessionUser } from "@/server/users/users-queries";

import { currentSessionUser } from "./session-policy";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
};

export class GuardError extends Error {
  constructor(
    readonly code: Extract<ErrorCode, "UNAUTHORIZED" | "FORBIDDEN">,
    message: string,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

/**
 * The signed-in user, checked against the database: null when there is no
 * session, when the owner has since deleted the account, or when its password
 * has changed. React's cache shares the one query between a layout and its
 * page; it does nothing inside a server action, which queries for itself.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return currentSessionUser(
    session.user,
    await findSessionUser(session.user.id),
  );
});

/**
 * The user as the session cookie describes them, WITHOUT asking the database.
 * For drawing the shell only: a deleted user's cookie still reads here, so
 * never decide access with it. The pages inside the shell call requireUser()
 * and redirect a dead session.
 */
export async function readSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  return {
    id: session.user.id,
    name: session.user.name ?? session.user.username,
    username: session.user.username,
    role: session.user.role,
  };
}

/**
 * Call this on the first line of every server action and every protected page.
 *
 * `proxy.ts` only redirects. Server Actions are publicly callable endpoints —
 * anyone who learns an action ID can invoke it directly regardless of what the
 * proxy does — so this is the real access control. See spec §7.2.
 *
 * A missing or dead session redirects to sign-in, from a page and from an
 * action alike. In an action, Next rejects the caller's promise and navigates
 * the browser to /login, so no screen needs its own "signed out" handling.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(AUTH_ROUTES.login);
  return user;
}

export async function requireSuperadmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN") {
    throw new GuardError("FORBIDDEN", "Only the owner account can do this.");
  }
  return user;
}

/**
 * Wraps a server action body so guard failures become ActionResults rather
 * than unhandled exceptions, and unexpected errors never leak internals.
 *
 * Next's own control flow — the redirect a dead session raises — passes
 * straight through.
 *
 * The correlation ID is logged server-side and shown to the user, so a support
 * call gives you something to grep for.
 */
export async function guarded<T>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    unstable_rethrow(error);

    if (error instanceof GuardError) {
      return fail(error.code, error.message);
    }

    const correlationId = crypto.randomUUID().slice(0, 8);
    console.error(`[${correlationId}] Unhandled action error:`, error);
    return fail(
      "UNKNOWN",
      `Something went wrong. Quote reference ${correlationId} if you report this.`,
    );
  }
}
