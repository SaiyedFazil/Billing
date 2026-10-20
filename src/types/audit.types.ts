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

/**
 * Current names of the things this page's audit rows point at, keyed by id:
 * items, categories, accounts, expenses and expense categories. Many rows
 * record only an id (a price change records the price, not the item's name).
 */
export type AuditRefs = Record<string, string>;

export type AuditLogPage = {
  rows: AuditLogEntry[];
  /** Total matching ROWS. */
  total: number;
  page: number;
  pageSize: number;
  refs: AuditRefs;
};

/** A sentence with some words in bold: plain runs and `{ strong }` runs. */
export type AuditText = Array<string | { strong: string }>;

export type AuditTone =
  "created" | "updated" | "removed" | "security" | "event";

export type AuditChange = {
  /** The recorded field name — stable, for keys and logic, never shown. */
  key: string;
  label: string;
  before: string;
  after: string;
  /** The difference, for money and stock counts: "+₹10.00", "−6". */
  delta: { text: string; direction: "up" | "down" } | null;
};

export type AuditFact = { key: string; label: string; value: string };

/** One audit row, described for a person rather than a developer. */
export type AuditDetails = {
  tone: AuditTone;
  /** What happened, in one sentence. */
  summary: AuditText;
  /** What it happened to, e.g. "Item · Fish Bowl". */
  subject: string | null;
  /** Fields whose value changed, old to new. */
  changes: AuditChange[];
  /** Facts about a thing created, removed or acted on. */
  facts: AuditFact[];
  factsTitle: string;
  notes: string[];
  /** Written by the menu card import rather than by a person. */
  imported: boolean;
};

export type AuditLogFilters = {
  action?: AuditAction;
  actorId?: string;
};
