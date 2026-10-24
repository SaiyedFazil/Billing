import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";

import { ONLINE_EXPENSE_MODES } from "@/constants/expense-modes";
import { db } from "@/db";
import {
  billPayments,
  bills,
  expenseCategories,
  expenses,
  users,
} from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import {
  buildCashBookDays,
  type CashBookDay,
  type CashBookSummary,
  summarizeCashBook,
} from "@/lib/utils/cash-book";
import { add, isZero, toAmount, ZERO } from "@/lib/utils/money";
import type {
  CategorySpendRow,
  ExpenseCategoryRow,
  ExpenseListFilters,
  ExpenseMonth,
  ExpensePage,
  ExpenseRow,
} from "@/types/expense.types";

/**
 * Reads for the owner-only Cash book. Call these only from a page or action
 * that has already run requireSuperadmin().
 *
 * Aggregates stay numeric and come back as decimal STRINGS (`::text`); never
 * cast to ::int, which would truncate every amount to whole rupees.
 */

/** A cancelled expense is a fact about the day, not money out. */
const ACTIVE = isNull(expenses.cancelledAt);

function expensesInRange(from: string, to: string) {
  return and(gte(expenses.expenseDate, from), lte(expenses.expenseDate, to));
}

export async function getCashBook(
  from: string,
  to: string,
): Promise<{ summary: CashBookSummary; days: CashBookDay[] }> {
  return withConnectionRetry(async () => {
    const [billRows, expenseRows] = await Promise.all([
      // Voided bills are excluded, as in every other money figure. Summed from
      // the payment lines, so a split bill's cash lands in cash and the rest
      // online.
      db
        .select({
          date: bills.businessDate,
          paymentMethod: billPayments.method,
          total: sql<string>`sum(${billPayments.amount})::text`,
        })
        .from(billPayments)
        .innerJoin(bills, eq(bills.id, billPayments.billId))
        .where(
          and(
            eq(bills.status, "COMPLETED"),
            gte(bills.businessDate, from),
            lte(bills.businessDate, to),
          ),
        )
        .groupBy(bills.businessDate, billPayments.method),
      db
        .select({
          date: expenses.expenseDate,
          mode: expenses.mode,
          total: sql<string>`sum(${expenses.amount})::text`,
        })
        .from(expenses)
        .where(and(ACTIVE, expensesInRange(from, to)))
        .groupBy(expenses.expenseDate, expenses.mode),
    ]);

    // The summary is built from the day rows, so the KPI cards always equal
    // the Day by day totals.
    const days = buildCashBookDays(
      billRows.map((row) => ({ ...row, total: toAmount(row.total) })),
      expenseRows.map((row) => ({ ...row, total: toAmount(row.total) })),
    );
    return { summary: summarizeCashBook(days), days };
  });
}

export async function getSpendByCategory(
  from: string,
  to: string,
): Promise<CategorySpendRow[]> {
  return withConnectionRetry(async () => {
    // Joined for the live name: renaming a category relabels its past spend,
    // and a retired one still names its old expenses. Spec §6.3.
    const rows = await db
      .select({
        categoryId: expenses.categoryId,
        name: expenseCategories.name,
        total: sql<string>`sum(${expenses.amount})::text`,
      })
      .from(expenses)
      .innerJoin(
        expenseCategories,
        eq(expenseCategories.id, expenses.categoryId),
      )
      .where(and(ACTIVE, expensesInRange(from, to)))
      .groupBy(expenses.categoryId, expenseCategories.name)
      .orderBy(desc(sql`sum(${expenses.amount})`), asc(expenseCategories.name));

    const grandTotal = rows.reduce(
      (sum, row) => add(sum, toAmount(row.total)),
      ZERO,
    );

    return rows.map((row) => ({
      ...row,
      total: toAmount(row.total),
      // A display percentage for the share bar, not money — a float is fine
      // here, and it is never summed back into an amount.
      sharePercent: isZero(grandTotal)
        ? 0
        : Math.round((Number(row.total) / Number(grandTotal)) * 1000) / 10,
    }));
  });
}

const EXPENSE_ROW_COLUMNS = {
  id: expenses.id,
  expenseDate: expenses.expenseDate,
  amount: expenses.amount,
  mode: expenses.mode,
  categoryId: expenses.categoryId,
  categoryName: expenseCategories.name,
  categoryIsActive: expenseCategories.isActive,
  paidTo: expenses.paidTo,
  note: expenses.note,
  createdByName: users.name,
  createdAt: expenses.createdAt,
  updatedAt: expenses.updatedAt,
  cancelledAt: expenses.cancelledAt,
  cancelReason: expenses.cancelReason,
};

function selectExpenseRows() {
  return db
    .select(EXPENSE_ROW_COLUMNS)
    .from(expenses)
    .innerJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .innerJoin(users, eq(users.id, expenses.createdBy));
}

type SelectedExpense = Awaited<ReturnType<typeof selectExpenseRows>>[number];

function toExpenseRow({ updatedAt, ...row }: SelectedExpense): ExpenseRow {
  return {
    ...row,
    amount: toAmount(row.amount),
    createdAt: row.createdAt.toISOString(),
    // Both timestamps come from the database clock, so equal means untouched.
    edited: updatedAt.getTime() > row.createdAt.getTime(),
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
  };
}

/**
 * The list filters as SQL. Shared by the list and the spreadsheet's total,
 * so the total always covers exactly the rows the filters select.
 */
function expenseListConditions(filters: ExpenseListFilters): SQL[] {
  const conditions: SQL[] = [
    gte(expenses.expenseDate, filters.from),
    lte(expenses.expenseDate, filters.to),
  ];
  if (filters.group === "CASH") conditions.push(eq(expenses.mode, "CASH"));
  if (filters.group === "ONLINE") {
    conditions.push(inArray(expenses.mode, [...ONLINE_EXPENSE_MODES]));
  }
  if (filters.categoryId) {
    conditions.push(eq(expenses.categoryId, filters.categoryId));
  }
  return conditions;
}

/**
 * Filtered and paginated in SQL, like the Bills ledger. Cancelled rows are
 * included: the list shows them struck through.
 */
export async function listExpenses(
  filters: ExpenseListFilters,
  page: number,
  pageSize: number,
): Promise<ExpensePage> {
  return withConnectionRetry(async () => {
    const where = and(...expenseListConditions(filters));

    const [rows, [totalRow]] = await Promise.all([
      selectExpenseRows()
        .where(where)
        .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt))
        .limit(pageSize)
        .offset((page - 1) * pageSize),
      db.select({ value: count() }).from(expenses).where(where),
    ]);

    return {
      rows: rows.map(toExpenseRow),
      total: totalRow?.value ?? 0,
      page,
      pageSize,
    };
  });
}

/**
 * What the filters add up to across every page, for the spreadsheet's footer.
 * A cancelled expense is listed but never counted.
 */
export async function getExpenseTotal(
  filters: ExpenseListFilters,
): Promise<string> {
  return withConnectionRetry(async () => {
    const [row] = await db
      .select({
        total: sql<string>`coalesce(sum(${expenses.amount}), 0)::text`,
      })
      .from(expenses)
      .where(and(ACTIVE, ...expenseListConditions(filters)));
    return toAmount(row?.total ?? ZERO);
  });
}

/**
 * Every month that has an expense, newest first, with how many it has.
 * Cancelled expenses count, because the spreadsheet lists them too.
 */
export async function listExpenseMonths(): Promise<ExpenseMonth[]> {
  return withConnectionRetry(async () => {
    const month = sql<string>`to_char(${expenses.expenseDate}, 'YYYY-MM')`;
    return db
      .select({ month, count: sql<number>`count(*)::int` })
      .from(expenses)
      .groupBy(month)
      .orderBy(desc(month));
  });
}

/** Every expense, oldest first, for a spreadsheet; within a range if given. */
export async function listExpensesForExport(range?: {
  from: string;
  to: string;
}): Promise<ExpenseRow[]> {
  return withConnectionRetry(async () => {
    const rows = await selectExpenseRows()
      .where(range ? expensesInRange(range.from, range.to) : undefined)
      .orderBy(asc(expenses.expenseDate), asc(expenses.createdAt));
    return rows.map(toExpenseRow);
  });
}

export async function listActiveExpenseCategories(): Promise<
  ExpenseCategoryRow[]
> {
  return withConnectionRetry(() =>
    db
      .select({ id: expenseCategories.id, name: expenseCategories.name })
      .from(expenseCategories)
      .where(eq(expenseCategories.isActive, true))
      .orderBy(asc(expenseCategories.name)),
  );
}
