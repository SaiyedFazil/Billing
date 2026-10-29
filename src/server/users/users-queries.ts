import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { bills, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type { SessionUserRecord } from "@/lib/auth/session-policy";
import type { UserRow } from "@/types/user.types";

/**
 * What the guard needs to decide whether a session still counts — and never
 * the password hash. Runs on every page and action, by primary key.
 */
export async function findSessionUser(
  id: string,
): Promise<SessionUserRecord | undefined> {
  return withConnectionRetry(async () =>
    db.query.users.findFirst({
      where: eq(users.id, id),
      columns: {
        id: true,
        name: true,
        username: true,
        role: true,
        isActive: true,
        sessionVersion: true,
      },
    }),
  );
}

export async function listUsers(): Promise<UserRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        lockedUntil: users.lockedUntil,
        createdAt: users.createdAt,
        billCount: sql<number>`
          (SELECT count(*)::int FROM ${bills} WHERE ${bills.createdBy} = ${users.id})
        `,
      })
      .from(users)
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
