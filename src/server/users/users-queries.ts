import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { bills, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type { UserRow } from "@/types/user.types";

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
