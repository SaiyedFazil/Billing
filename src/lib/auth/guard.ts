import { auth } from "@/auth";
import type { Role } from "@/constants/roles";
import { type ActionResult, type ErrorCode, fail } from "@/lib/utils/result";

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
 * Call this on the first line of every server action and every protected page.
 *
 * `proxy.ts` only redirects. Server Actions are publicly callable endpoints —
 * anyone who learns an action ID can invoke it directly regardless of what the
 * proxy does — so this is the real access control. See spec §7.2.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new GuardError("UNAUTHORIZED", "You must be signed in.");
  }
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.username,
    username: session.user.username,
    role: session.user.role,
  };
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
 * The correlation ID is logged server-side and shown to the user, so a support
 * call gives you something to grep for.
 */
export async function guarded<T>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
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
