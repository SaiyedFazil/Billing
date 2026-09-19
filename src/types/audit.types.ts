import type { AuditAction } from "@/constants/audit-actions";

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
  /** Null for a failed sign-in, which has no authenticated actor. */
  actorName: string | null;
};

export type AuditLogPage = {
  rows: AuditLogEntry[];
  /** Total matching ROWS. */
  total: number;
  page: number;
  pageSize: number;
};

export type AuditLogFilters = {
  action?: AuditAction;
  actorId?: string;
};
