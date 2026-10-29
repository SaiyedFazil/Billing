import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import { LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS } from "@/constants/sign-in";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Counts a sign-in attempt BEFORE its password is checked, and says whether
 * the account may try at all — false while it is locked.
 *
 * One UPDATE does the check and the count, and it locks the account on the
 * MAX_FAILED_ATTEMPTS-th attempt. Attempts sent in parallel queue on the row,
 * so at most MAX_FAILED_ATTEMPTS of them reach a password check before the
 * lock lands. Counting after a wrong password instead let every attempt that
 * arrived together pass the lock check first.
 *
 * A correct password then clears the count (clearFailedLogins), so only
 * consecutive failures add up.
 */
export async function claimSignInAttempt(userId: string): Promise<boolean> {
  const now = new Date();
  const lockUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60 * 1000);

  const claimed = await db
    .update(users)
    .set({
      failedAttempts: sql`${users.failedAttempts} + 1`,
      // Both sides read the row as it was before this update.
      lockedUntil: sql`case when ${users.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then ${lockUntil.toISOString()}::timestamptz else null end`,
    })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lockedUntil), lte(users.lockedUntil, now)),
      ),
    )
    .returning({ id: users.id });

  return claimed.length > 0;
}

/** Clears the count after a successful sign-in. */
export async function clearFailedLogins(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null })
    .where(eq(users.id, userId));
}
