import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "../src/db";
import { auditLog, expenseCategories, expenses, users } from "../src/db/schema";
import { shiftIsoDate } from "../src/lib/utils/date-range";
import { businessDate } from "../src/lib/utils/dates";
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
