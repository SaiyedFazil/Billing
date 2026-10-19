"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { fieldErrors } from "@/lib/utils/field-errors";
import { type ActionResult, fail } from "@/lib/utils/result";
import {
  cancelExpenseSchema,
  createExpenseSchema,
  expenseCategorySchema,
  updateExpenseCategorySchema,
  updateExpenseSchema,
} from "@/lib/validation/expense-schema";
import {
  cancelExpense,
  createExpense,
  createExpenseCategory,
  renameExpenseCategory,
  retireExpenseCategory,
  updateExpense,
} from "@/server/expenses/expenses-service";

/**
 * The owner's money out. Each action is a public endpoint, so each one checks
 * the owner itself — hiding the page from cashiers is not access control.
 */

function invalid<T>(error: z.ZodError): ActionResult<T> {
  return fail<T>(
    "VALIDATION",
    "Check the highlighted fields.",
    fieldErrors(error),
  );
}

function revalidateOnSuccess<T>(result: ActionResult<T>): ActionResult<T> {
  if (result.ok) revalidatePath(ADMIN_ROUTES.cashBook);
  return result;
}

export async function createExpenseAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = createExpenseSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);

    return revalidateOnSuccess(await createExpense(parsed.data, user.id));
  });
}

export async function updateExpenseAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = updateExpenseSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);

    return revalidateOnSuccess(await updateExpense(parsed.data, user.id));
  });
}

export async function cancelExpenseAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = cancelExpenseSchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);

    return revalidateOnSuccess(await cancelExpense(parsed.data, user.id));
  });
}

export async function createExpenseCategoryAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = expenseCategorySchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);

    return revalidateOnSuccess(
      await createExpenseCategory(parsed.data, user.id),
    );
  });
}

export async function updateExpenseCategoryAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = updateExpenseCategorySchema.safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);

    return revalidateOnSuccess(
      await renameExpenseCategory(parsed.data, user.id),
    );
  });
}

export async function retireExpenseCategoryAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = z.object({ id: z.uuid() }).safeParse(payload);
    if (!parsed.success) return invalid(parsed.error);

    return revalidateOnSuccess(
      await retireExpenseCategory(parsed.data.id, user.id),
    );
  });
}
