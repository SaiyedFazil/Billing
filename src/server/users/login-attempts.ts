import { eq, sql } from "drizzle-orm";

import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/constants/sign-in";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Records a failed sign-in and locks the account after MAX_FAILED_ATTEMPTS
 * consecutive failures.
 *
 * Silently does nothing when the username does not exist — counting attempts
 * against a non-existent account would reveal which usernames are real.
 */
export async function registerFailedLogin(username: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.username}) = lower(${username})`,
    columns: { id: true, failedAttempts: true },
  });

  if (!user) return;

  const attempts = user.failedAttempts + 1;
  const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

  await db
    .update(users)
    .set({
      failedAttempts: attempts,
      lockedUntil: shouldLock
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : null,
    })
    .where(eq(users.id, user.id));
}

/** Clears the counter after a successful sign-in. */
export async function clearFailedLogins(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId));
}
