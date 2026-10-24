import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/db";
import { auditLog, expenseCategories, expenses, users } from "../src/db/schema";
import { presetRange, shiftIsoDate } from "../src/lib/utils/date-range";
import { businessDate } from "../src/lib/utils/dates";
import { add, ZERO } from "../src/lib/utils/money";
import type { ActionResult } from "../src/lib/utils/result";
import {
  createExpenseSchema,
  updateExpenseSchema,
} from "../src/lib/validation/expense-schema";
import {
  cancelExpense,
  createExpense,
  createExpenseCategory,
  renameExpenseCategory,
  retireExpenseCategory,
  updateExpense,
} from "../src/server/expenses/expenses-service";
import {
  getCashBook,
  getExpenseTotal,
  getSpendByCategory,
  listExpenseMonths,
  listExpenses,
} from "../src/server/expenses/expenses-queries";
import { getPaymentBreakdown } from "../src/server/reports/reports-queries";
import { getShopTimezone } from "../src/server/settings/settings-queries";

/**
 * Expenses against a real database. Works on its own probe user and probe
 * categories, so the owner's categories are never renamed or retired — the
 * one check that must retire them restores them in `finally`.
 */

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    console.log(`PASS — ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  }
}

const PROBE_USER = "expenses-probe";
const PROBE_PREFIX = "Expense Probe";

function errorOf<T>(result: ActionResult<T>) {
  return result.ok ? null : result.error;
}

async function cleanup() {
  await db.execute(
    sql`ALTER TABLE expenses DISABLE TRIGGER expenses_no_delete`,
  );
  await db.execute(
    sql`ALTER TABLE expense_categories DISABLE TRIGGER expense_categories_no_delete`,
  );
  try {
    await db.execute(sql`
      DELETE FROM expenses WHERE created_by IN
        (SELECT id FROM users WHERE username = ${PROBE_USER})
    `);
    await db.execute(
      sql`DELETE FROM expense_categories WHERE name ILIKE ${`${PROBE_PREFIX}%`}`,
    );
    await db.execute(sql`
      DELETE FROM audit_log WHERE actor_id IN
        (SELECT id FROM users WHERE username = ${PROBE_USER})
    `);
    await db.execute(sql`DELETE FROM users WHERE username = ${PROBE_USER}`);
  } finally {
    await db.execute(
      sql`ALTER TABLE expenses ENABLE TRIGGER expenses_no_delete`,
    );
    await db.execute(
      sql`ALTER TABLE expense_categories ENABLE TRIGGER expense_categories_no_delete`,
    );
  }
}

async function main() {
  // A crashed earlier run may have left probes behind.
  await cleanup();

  const [user] = await db
    .insert(users)
    .values({
      username: PROBE_USER,
      passwordHash: "x",
      name: "Expenses Probe",
      role: "SUPERADMIN",
    })
    .returning({ id: users.id });

  const probe = async (letter: string) => {
    const result = await createExpenseCategory(
      { name: `${PROBE_PREFIX} ${letter}` },
      user.id,
    );
    if (!result.ok) throw new Error(`setup: ${result.error.message}`);
    return result.data.id;
  };
  const categoryA = await probe("A");
  const categoryB = await probe("B");
  const categoryC = await probe("C");

  const timeZone = await getShopTimezone();
  const today = businessDate(new Date(), timeZone);

  const input = (overrides: Record<string, unknown> = {}) =>
    createExpenseSchema.parse({
      idempotencyKey: crypto.randomUUID(),
      expenseDate: today,
      amount: "100.00",
      mode: "CASH",
      categoryId: categoryC,
      paidTo: null,
      note: null,
      ...overrides,
    });

  const amountOf = async (id: string) =>
    (
      await db
        .select({ amount: expenses.amount })
        .from(expenses)
        .where(eq(expenses.id, id))
    )[0]?.amount;

  // --- create and idempotency -------------------------------------------
  const key = crypto.randomUUID();
  const first = await createExpense(
    input({ idempotencyKey: key, amount: " 250 " }),
    user.id,
  );
  check(
    "create stores 250.00",
    first.ok && (await amountOf(first.data.id)) === "250.00",
    first,
  );

  const retry = await createExpense(
    input({ idempotencyKey: key, amount: "999.00" }),
    user.id,
  );
  const sameKeyRows = await db
    .select({ id: expenses.id, amount: expenses.amount })
    .from(expenses)
    .where(eq(expenses.idempotencyKey, key));
  check(
    "the same idempotency key returns the first expense",
    first.ok &&
      retry.ok &&
      retry.data.id === first.data.id &&
      sameKeyRows.length === 1 &&
      sameKeyRows[0].amount === "250.00",
    { retry, sameKeyRows },
  );

  // --- dates ------------------------------------------------------------
  const tomorrow = await createExpense(
    input({ expenseDate: shiftIsoDate(today, 1) }),
    user.id,
  );
  check(
    "tomorrow in the shop's timezone is refused",
    errorOf(tomorrow)?.code === "VALIDATION" &&
      errorOf(tomorrow)?.fields?.expenseDate ===
        "The date can't be in the future",
    tomorrow,
  );
  const todayResult = await createExpense(input(), user.id);
  check(
    "today in the shop's timezone is accepted",
    todayResult.ok,
    todayResult,
  );

  // --- categories on create --------------------------------------------
  const retireB = await retireExpenseCategory(categoryB, user.id);
  const onRetired = await createExpense(
    input({ categoryId: categoryB }),
    user.id,
  );
  check(
    "a retired category is refused on create",
    retireB.ok &&
      errorOf(onRetired)?.code === "VALIDATION" &&
      errorOf(onRetired)?.fields?.categoryId ===
        "That category was retired. Choose another.",
    { retireB, onRetired },
  );

  // --- edit ---------------------------------------------------------------
  if (!todayResult.ok) throw new Error("cannot continue without an expense");
  const editable = todayResult.data.id;
  const edit = await updateExpense(
    updateExpenseSchema.parse({
      ...input({ amount: "120.50", note: "edited" }),
      id: editable,
    }),
    user.id,
  );
  const [audit] = await db
    .select({ before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "EXPENSE_UPDATED"),
        eq(auditLog.entityId, editable),
      ),
    );
  check(
    "edit writes EXPENSE_UPDATED with before and after",
    edit.ok &&
      (audit?.before as { amount?: string })?.amount === "100.00" &&
      (audit?.after as { amount?: string })?.amount === "120.50" &&
      (await amountOf(editable)) === "120.50",
    { edit, audit },
  );

  const onA = await createExpense(input({ categoryId: categoryA }), user.id);
  if (!onA.ok) throw new Error("setup: could not create on Probe A");
  await retireExpenseCategory(categoryA, user.id);
  const keepRetired = await updateExpense(
    updateExpenseSchema.parse({
      ...input({ categoryId: categoryA, note: "still on A" }),
      id: onA.data.id,
    }),
    user.id,
  );
  check("edit keeps a since-retired category", keepRetired.ok, keepRetired);
  const moveToRetired = await updateExpense(
    updateExpenseSchema.parse({
      ...input({ categoryId: categoryB }),
      id: onA.data.id,
    }),
    user.id,
  );
  check(
    "edit cannot move to a different retired category",
    errorOf(moveToRetired)?.code === "VALIDATION" &&
      Boolean(errorOf(moveToRetired)?.fields?.categoryId),
    moveToRetired,
  );

  // --- cancel -------------------------------------------------------------
  const cancel = await cancelExpense(
    { id: editable, reason: "Entered twice" },
    user.id,
  );
  const [cancelled] = await db
    .select({ reason: expenses.cancelReason, by: expenses.cancelledBy })
    .from(expenses)
    .where(eq(expenses.id, editable));
  check(
    "cancel stores the reason",
    cancel.ok &&
      cancelled?.reason === "Entered twice" &&
      cancelled.by === user.id,
    { cancel, cancelled },
  );
  const again = await cancelExpense({ id: editable, reason: "again" }, user.id);
  check(
    "a second cancel is CONFLICT",
    errorOf(again)?.code === "CONFLICT" &&
      errorOf(again)?.message === "That expense is already cancelled.",
    again,
  );
  const editCancelled = await updateExpense(
    updateExpenseSchema.parse({ ...input(), id: editable }),
    user.id,
  );
  check(
    "editing a cancelled expense is CONFLICT",
    errorOf(editCancelled)?.code === "CONFLICT" &&
      errorOf(editCancelled)?.message ===
        "That expense was cancelled, so it can't be changed.",
    editCancelled,
  );
  const missing = await cancelExpense(
    { id: crypto.randomUUID(), reason: "probe" },
    user.id,
  );
  check(
    "cancelling a missing expense is NOT_FOUND",
    errorOf(missing)?.code === "NOT_FOUND",
    missing,
  );

  // --- reads -------------------------------------------------------------
  // A range no real bill or expense falls in, so the figures are exact.
  const probeRange = { from: "2000-01-01", to: "2000-01-02" };
  const categoryE = await probe("E");
  const old = (overrides: Record<string, unknown>) =>
    createExpense(input({ expenseDate: "2000-01-01", ...overrides }), user.id);
  await old({ amount: "60.50", mode: "CASH" });
  await old({ amount: "40.30", mode: "UPI", categoryId: categoryE });
  const toCancel = await old({ amount: "999.00", mode: "CASH" });
  if (!toCancel.ok) throw new Error("setup: could not create the 999.00");
  await cancelExpense(
    { id: toCancel.data.id, reason: "Wrong amount" },
    user.id,
  );
  await retireExpenseCategory(categoryE, user.id);

  const { summary } = await getCashBook(probeRange.from, probeRange.to);
  check(
    "getCashBook counts active expenses only",
    JSON.stringify(summary.moneyOut) ===
      JSON.stringify({
        cash: "60.50",
        online: "40.30",
        other: "0.00",
        total: "100.80",
      }) &&
      summary.moneyIn.total === "0.00" &&
      summary.net.total === "-100.80",
    summary,
  );

  const spend = await getSpendByCategory(probeRange.from, probeRange.to);
  check(
    "spend by category keeps a retired category's name",
    spend.length === 2 &&
      spend[0].name === `${PROBE_PREFIX} C` &&
      spend[0].total === "60.50" &&
      spend[1].name === `${PROBE_PREFIX} E` &&
      spend[1].total === "40.30",
    spend,
  );

  const cashPage = await listExpenses({ ...probeRange, group: "CASH" }, 1, 25);
  check(
    "listExpenses filters by group and includes cancelled rows",
    cashPage.total === 2 &&
      cashPage.rows.length === 2 &&
      cashPage.rows[0].amount === "999.00" &&
      cashPage.rows[0].cancelReason === "Wrong amount" &&
      cashPage.rows[1].amount === "60.50" &&
      cashPage.rows[1].cancelledAt === null,
    cashPage,
  );

  // The spreadsheet's footer and month list.
  const [allTotal, cashTotal, onlineTotal, months] = await Promise.all([
    getExpenseTotal(probeRange),
    getExpenseTotal({ ...probeRange, group: "CASH" }),
    getExpenseTotal({ ...probeRange, group: "ONLINE", categoryId: categoryE }),
    listExpenseMonths(),
  ]);
  check(
    "the spreadsheet total skips the cancelled 999.00 and follows the filters",
    allTotal === "100.80" && cashTotal === "60.50" && onlineTotal === "40.30",
    { allTotal, cashTotal, onlineTotal },
  );
  check(
    "the month list counts every expense in a month, cancelled ones too",
    months.find((entry) => entry.month === "2000-01")?.count === 3,
    months.find((entry) => entry.month === "2000-01"),
  );
  check(
    "the month list runs newest first",
    months.every(
      (entry, index) => index === 0 || months[index - 1].month > entry.month,
    ),
    months.map((entry) => entry.month),
  );
  check(
    "a period with no expenses totals 0.00",
    (await getExpenseTotal({ from: "1999-06-01", to: "1999-06-30" })) ===
      "0.00",
  );
  const pageOfTwo = await listExpenses(probeRange, 1, 2);
  const secondPage = await listExpenses(probeRange, 2, 2);
  check(
    "a smaller page size pages the same rows",
    pageOfTwo.rows.length === 2 &&
      secondPage.rows.length === 1 &&
      pageOfTwo.total === 3 &&
      !pageOfTwo.rows.some((row) => row.id === secondPage.rows[0]?.id),
    { pageOfTwo, secondPage },
  );

  const last30 = presetRange("LAST_30", timeZone);
  const [cashBook30, payments30] = await Promise.all([
    getCashBook(last30.from, last30.to),
    getPaymentBreakdown(last30.from, last30.to),
  ]);
  const paid = (method: string) =>
    payments30.find((row) => row.paymentMethod === method)?.net ?? ZERO;
  check(
    "money in matches the Sales payment breakdown",
    cashBook30.summary.moneyIn.cash === paid("CASH") &&
      cashBook30.summary.moneyIn.online === add(paid("UPI"), paid("CARD")) &&
      cashBook30.summary.moneyIn.other === paid("OTHER"),
    { moneyIn: cashBook30.summary.moneyIn, payments30 },
  );

  const onAPage = await listExpenses(
    { from: today, to: today, categoryId: categoryA },
    1,
    25,
  );
  check(
    "an edited expense is marked edited and a fresh one is not",
    onAPage.rows[0]?.edited === true && cashPage.rows[1]?.edited === false,
    { edited: onAPage.rows[0], fresh: cashPage.rows[1] },
  );

  // --- category names -----------------------------------------------------
  const categoryD = await probe("D");
  const rename = await renameExpenseCategory(
    { id: categoryD, name: `${PROBE_PREFIX.toLowerCase()} c` },
    user.id,
  );
  check(
    "renaming to an active name in another case is CONFLICT",
    errorOf(rename)?.code === "CONFLICT" &&
      errorOf(rename)?.fields?.name === "Already in use",
    rename,
  );
  const duplicate = await createExpenseCategory(
    { name: `${PROBE_PREFIX.toUpperCase()} C` },
    user.id,
  );
  check(
    "adding an active name in another case is CONFLICT",
    errorOf(duplicate)?.code === "CONFLICT",
    duplicate,
  );

  // --- the last category --------------------------------------------------
  const active = (
    await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(eq(expenseCategories.isActive, true))
  ).map((row) => row.id);
  try {
    await db
      .update(expenseCategories)
      .set({ isActive: false })
      .where(
        and(
          inArray(expenseCategories.id, active),
          sql`${expenseCategories.id} <> ${categoryC}`,
        ),
      );
    const last = await retireExpenseCategory(categoryC, user.id);
    check(
      "the last active category cannot be retired",
      errorOf(last)?.code === "CONFLICT" &&
        errorOf(last)?.message ===
          "Keep at least one category, or there's nothing to file expenses under.",
      last,
    );
  } finally {
    await db
      .update(expenseCategories)
      .set({ isActive: true })
      .where(inArray(expenseCategories.id, active));
  }

  await cleanup();

  console.log(
    failures === 0
      ? "\nAll expense checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await cleanup().catch(() => {});
  process.exit(1);
});
