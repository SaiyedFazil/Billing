import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";

import { db } from "@/db";
import {
  auditLog,
  categories,
  expenseCategories,
  expenses,
  items,
  users,
} from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import { formatINR, toAmount } from "@/lib/utils/money";
import type {
  AuditLogEntry,
  AuditLogFilters,
  AuditLogPage,
  AuditRefs,
} from "@/types/audit.types";

// Payload ids are free-form JSON: a malformed one must not reach a uuid
// column, where Postgres would reject the whole query and the page with it.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Current names for everything a page of audit rows points at, so the
 * details dialog can say "Fish Bowl" where the row recorded only an id.
 * Retired rows are included: a removed item still has a name.
 */
async function resolveRefs(rows: AuditLogEntry[]): Promise<AuditRefs> {
  const wanted = {
    item: new Set<string>(),
    category: new Set<string>(),
    user: new Set<string>(),
    expense: new Set<string>(),
    expense_category: new Set<string>(),
  };
  type Kind = keyof typeof wanted;
  const want = (kind: Kind, id: unknown) => {
    if (typeof id === "string" && UUID.test(id)) wanted[kind].add(id);
  };

  for (const row of rows) {
    if (row.entityType in wanted) want(row.entityType as Kind, row.entityId);
    // Items record their category, expenses their expense category.
    for (const payload of [row.before, row.after]) {
      if (payload && typeof payload === "object" && "categoryId" in payload) {
        want(
          row.entityType === "expense" ? "expense_category" : "category",
          payload.categoryId,
        );
      }
    }
  }

  const ids = (kind: Kind) => [...wanted[kind]];
  const none = Promise.resolve([] as Array<{ id: string; name: string }>);

  const [itemRows, categoryRows, userRows, expenseCategoryRows, expenseRows] =
    await Promise.all([
      wanted.item.size
        ? db
            .select({ id: items.id, name: items.name })
            .from(items)
            .where(inArray(items.id, ids("item")))
        : none,
      wanted.category.size
        ? db
            .select({ id: categories.id, name: categories.name })
            .from(categories)
            .where(inArray(categories.id, ids("category")))
        : none,
      wanted.user.size
        ? db
            .select({ id: users.id, name: users.name })
            .from(users)
            .where(inArray(users.id, ids("user")))
        : none,
      wanted.expense_category.size
        ? db
            .select({ id: expenseCategories.id, name: expenseCategories.name })
            .from(expenseCategories)
            .where(inArray(expenseCategories.id, ids("expense_category")))
        : none,
      wanted.expense.size
        ? db
            .select({
              id: expenses.id,
              amount: expenses.amount,
              paidTo: expenses.paidTo,
              categoryName: expenseCategories.name,
            })
            .from(expenses)
            .innerJoin(
              expenseCategories,
              eq(expenseCategories.id, expenses.categoryId),
            )
            .where(inArray(expenses.id, ids("expense")))
        : Promise.resolve([]),
    ]);

  const refs: AuditRefs = {};
  for (const row of [
    ...itemRows,
    ...categoryRows,
    ...userRows,
    ...expenseCategoryRows,
  ]) {
    refs[row.id] = row.name;
  }
  // An expense has no name, so it reads as its amount, category and payee.
  for (const row of expenseRows) {
    refs[row.id] = [
      formatINR(toAmount(row.amount)),
      row.categoryName,
      row.paidTo,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return refs;
}

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

    return {
      rows,
      total: totalRow?.value ?? 0,
      page,
      pageSize,
      refs: await resolveRefs(rows),
    };
  });
}
