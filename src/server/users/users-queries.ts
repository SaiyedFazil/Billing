import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { bills, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import { passwordStamp } from "@/lib/auth/password-stamp";
import type { SessionUserRecord } from "@/lib/auth/session-policy";
import type { UserRow } from "@/types/user.types";

/**
 * What the guard needs to decide whether a session still counts. Runs on
 * every page and action, by primary key. The password hash is read only to
 * stamp it and never leaves this function.
 */
export async function findSessionUser(
  id: string,
): Promise<SessionUserRecord | undefined> {
  const row = await withConnectionRetry(async () =>
    db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        passwordHash: true,
      },
    }),
  );
  if (!row) return undefined;

  const { passwordHash, ...user } = row;
  return { ...user, passwordStamp: passwordStamp(passwordHash) };
}

/** The accounts the shop has — deleted ones (is_active = false) are left out. */
export async function listUsers(): Promise<UserRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        role: users.role,
        lockedUntil: users.lockedUntil,
        createdAt: users.createdAt,
        // A join, not a subquery: Drizzle writes a single-table select's
        // columns without their table, so a subquery read
        // `WHERE "created_by" = "id"` — bills.id — and counted 0 for everyone.
        billCount: count(bills.id),
      })
      .from(users)
      .leftJoin(bills, eq(bills.createdBy, users.id))
      .where(eq(users.isActive, true))
      .groupBy(users.id)
      .orderBy(asc(users.name)),
  );
}

/**
 * Enforces "there must always be one active superadmin".
 *
 * Counts only ACTIVE ones — a deactivated owner cannot sign in, so counting
 * them would let the shop lock itself out entirely. Drizzle drops `undefined`
 * conditions inside `and()`, so the optional exclusion needs no branching.
 */
export async function countActiveSuperadmins(
  excludingId?: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.role, "SUPERADMIN"),
        eq(users.isActive, true),
        excludingId ? ne(users.id, excludingId) : undefined,
      ),
    );
  return row?.n ?? 0;
}
