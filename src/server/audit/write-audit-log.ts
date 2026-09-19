import type { AuditAction } from "@/constants/audit-actions";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditEntry = {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Never throws.
 *
 * An audit write failing must not take down the operation it is recording — a
 * cashier should not lose a sale because the log insert failed. But it must be
 * loud in the server log so the gap is discoverable.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    });
  } catch (error) {
    console.error("AUDIT WRITE FAILED", entry.action, entry.entityType, error);
  }
}
