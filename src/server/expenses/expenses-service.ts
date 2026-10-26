import { and, count, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { expenseCategories, expenses } from "@/db/schema";
import { isFutureDate } from "@/lib/utils/cash-book";
import { businessDate } from "@/lib/utils/dates";
import { isUniqueViolation } from "@/lib/utils/parse-db-error";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import type {
  CancelExpenseInput,
  CreateExpenseInput,
  ExpenseCategoryInput,
  UpdateExpenseCategoryInput,
  UpdateExpenseInput,
} from "@/lib/validation/expense-schema";
import { getShopTimezone } from "@/server/settings/settings-queries";

/**
 * Money out. Every check that can fail runs before the write, and every write
 * is one statement — so there is no transaction to get wrong. Cash book spec §9.
 */

const FUTURE_DATE = "The date can't be in the future";
const RETIRED_CATEGORY = "That category was retired. Choose another.";
const MISSING_EXPENSE = "That expense no longer exists.";
const CANCELLED_EXPENSE = "That expense was cancelled, so it can't be changed.";
const MISSING_CATEGORY = "That category no longer exists.";
const NAME_TAKEN = "A category with that name already exists.";

/** The shop's today, not the server's: 00:30 IST is still "today" in IST. */
async function isInFuture(expenseDate: string): Promise<boolean> {
  const today = businessDate(new Date(), await getShopTimezone());
  return isFutureDate(expenseDate, today);
}

async function findCategory(id: string) {
  const [category] = await db
    .select({
      id: expenseCategories.id,
      name: expenseCategories.name,
      isActive: expenseCategories.isActive,
    })
    .from(expenseCategories)
    .where(eq(expenseCategories.id, id))
    .limit(1);
  return category ?? null;
}

async function findByIdempotencyKey(key: string) {
  const [existing] = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.idempotencyKey, key))
    .limit(1);
  return existing ?? null;
}

export async function createExpense(
  input: CreateExpenseInput,
  userId: string,
): Promise<ActionResult<{ id: string }>> {
  // A retry of a save that already landed returns the original, whatever the
  // retry now carries.
  const saved = await findByIdempotencyKey(input.idempotencyKey);
  if (saved) return ok(saved);

  if (await isInFuture(input.expenseDate)) {
    return fail("VALIDATION", FUTURE_DATE, { expenseDate: FUTURE_DATE });
  }

  const category = await findCategory(input.categoryId);
  if (!category?.isActive) {
    return fail("VALIDATION", RETIRED_CATEGORY, {
      categoryId: RETIRED_CATEGORY,
    });
  }

  try {
    const [created] = await db
      .insert(expenses)
      .values({ ...input, createdBy: userId })
      .returning({ id: expenses.id });

    return ok(created);
  } catch (error) {
    // Two saves raced with the same key. The other one won; return it.
    if (isUniqueViolation(error, "expenses_idempotency_key_idx")) {
      const raced = await findByIdempotencyKey(input.idempotencyKey);
      if (raced) return ok(raced);
    }
    throw error;
  }
}

export async function updateExpense(
  input: UpdateExpenseInput,
  userId: string,
): Promise<ActionResult<null>> {
  const { id, ...values } = input;

  const before = await db.query.expenses.findFirst({
    where: eq(expenses.id, id),
  });
  if (!before) return fail("NOT_FOUND", MISSING_EXPENSE);
  if (before.cancelledAt) return fail("CONFLICT", CANCELLED_EXPENSE);

  if (await isInFuture(values.expenseDate)) {
    return fail("VALIDATION", FUTURE_DATE, { expenseDate: FUTURE_DATE });
  }

  // An old expense may keep a category retired since; it may not move to one.
  if (values.categoryId !== before.categoryId) {
    const category = await findCategory(values.categoryId);
    if (!category?.isActive) {
      return fail("VALIDATION", RETIRED_CATEGORY, {
        categoryId: RETIRED_CATEGORY,
      });
    }
  }

  // The cancelled_at guard makes a cancel in another tab win cleanly; the
  // trigger is the backstop if this check is ever removed.
  const [updated] = await db
    .update(expenses)
    // now(), not new Date(): created_at is the database clock, and the list
    // marks a row "Edited" by comparing the two.
    .set({ ...values, updatedBy: userId, updatedAt: sql`now()` })
    .where(and(eq(expenses.id, id), isNull(expenses.cancelledAt)))
    .returning({ id: expenses.id });
  if (!updated) return fail("CONFLICT", CANCELLED_EXPENSE);

  return ok(null);
}

export async function cancelExpense(
  input: CancelExpenseInput,
  userId: string,
): Promise<ActionResult<null>> {
  // updated_at is left alone: cancelling is not an edit, and the list marks
  // edited rows by it.
  const [cancelled] = await db
    .update(expenses)
    .set({
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancelReason: input.reason,
    })
    .where(and(eq(expenses.id, input.id), isNull(expenses.cancelledAt)))
    .returning({ id: expenses.id });

  if (!cancelled) {
    const existing = await db.query.expenses.findFirst({
      where: eq(expenses.id, input.id),
      columns: { id: true },
    });
    return existing
      ? fail("CONFLICT", "That expense is already cancelled.")
      : fail("NOT_FOUND", MISSING_EXPENSE);
  }

  return ok(null);
}

/** Case-insensitive duplicate check among ACTIVE categories only. */
async function nameIsTaken(name: string, exceptId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(
      and(
        sql`lower(${expenseCategories.name}) = lower(${name})`,
        eq(expenseCategories.isActive, true),
        exceptId ? ne(expenseCategories.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

function nameConflict<T>(): ActionResult<T> {
  return fail<T>("CONFLICT", NAME_TAKEN, { name: "Already in use" });
}

export async function createExpenseCategory(
  input: ExpenseCategoryInput,
): Promise<ActionResult<{ id: string }>> {
  if (await nameIsTaken(input.name)) return nameConflict();

  try {
    const [created] = await db
      .insert(expenseCategories)
      .values({ name: input.name })
      .returning({ id: expenseCategories.id });

    return ok(created);
  } catch (error) {
    if (isUniqueViolation(error, "expense_categories_name_lower_idx")) {
      return nameConflict();
    }
    throw error;
  }
}

export async function renameExpenseCategory(
  input: UpdateExpenseCategoryInput,
): Promise<ActionResult<null>> {
  const before = await findCategory(input.id);
  if (!before?.isActive) return fail("NOT_FOUND", MISSING_CATEGORY);
  if (await nameIsTaken(input.name, input.id)) return nameConflict();

  try {
    await db
      .update(expenseCategories)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(expenseCategories.id, input.id));
  } catch (error) {
    if (isUniqueViolation(error, "expense_categories_name_lower_idx")) {
      return nameConflict();
    }
    throw error;
  }

  return ok(null);
}

/**
 * Retiring is allowed even when expenses use the category — they keep it, and
 * it leaves the picker. Retiring the LAST one is not, or no expense could be
 * added at all.
 */
export async function retireExpenseCategory(
  id: string,
): Promise<ActionResult<null>> {
  const before = await findCategory(id);
  if (!before?.isActive) return fail("NOT_FOUND", MISSING_CATEGORY);

  const lastCategory = fail<null>(
    "CONFLICT",
    "Keep at least one category, or there's nothing to file expenses under.",
  );

  const [{ active }] = await db
    .select({ active: count() })
    .from(expenseCategories)
    .where(eq(expenseCategories.isActive, true));
  if (active <= 1) return lastCategory;

  // The count is repeated inside the UPDATE so two retires at once cannot
  // both pass and leave nothing.
  const [retired] = await db
    .update(expenseCategories)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(expenseCategories.id, id),
        eq(expenseCategories.isActive, true),
        sql`(SELECT count(*) FROM expense_categories WHERE is_active) > 1`,
      ),
    )
    .returning({ id: expenseCategories.id });
  if (!retired) return lastCategory;

  return ok(null);
}
