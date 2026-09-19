import { and, count, desc, eq, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type { AuditLogFilters, AuditLogPage } from "@/types/audit.types";

export async function listAuditLog(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<AuditLogPage> {
  return withConnectionRetry(async () => {
    const conditions: SQL[] = [];
    if (filters.action) conditions.push(eq(auditLog.action, filters.action));
    if (filters.actorId) conditions.push(eq(auditLog.actorId, filters.actorId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          before: auditLog.before,
          after: auditLog.after,
          createdAt: auditLog.createdAt,
          actorName: users.name,
        })
        .from(auditLog)
        // LEFT join: a failed sign-in has no actor, and those rows matter most.
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(auditLog).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0, page, pageSize };
  });
}
