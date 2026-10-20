import { z } from "zod";

import { EXPENSE_MODES } from "@/constants/expense-modes";
import { MAX_EXPENSE } from "@/lib/utils/cash-book";
import { isValidIsoDate } from "@/lib/utils/date-range";
import { compare, parseRupees } from "@/lib/utils/money";

/** Rupees with at most two decimals. Must match money.ts. */
const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Blank means "not given" and is stored as NULL, so the database never holds
 * an empty string that the length CHECK would reject.
 */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((value) => value || null)
    .nullable();

/**
 * A decimal STRING, never z.number(): a JSON number is an IEEE-754 double.
 * The refinements run only once the pattern has passed, so they always see a
 * normalised "250.00".
 */
const amount = z
  .string()
  .trim()
  .regex(RUPEE_PATTERN, "Enter an amount like 250.00")
  .transform(parseRupees)
  .refine((value) => compare(value, "0") > 0, "Enter an amount above ₹0")
  .refine(
    (value) => compare(value, MAX_EXPENSE) <= 0,
    "That's more than ₹10,00,000. Check the amount.",
  );

/**
 * The fields the owner types. Whether the date is in the future depends on the
 * shop's timezone, so that check lives in the service, not here.
 */
export const expenseSchema = z.object({
  expenseDate: z.string().refine(isValidIsoDate, "Choose a date"),
  amount,
  mode: z.enum(EXPENSE_MODES),
  categoryId: z.uuid("Choose a category"),
  paidTo: optionalText(80, "Keep this to 80 characters"),
  note: optionalText(200, "Keep the note to 200 characters"),
});

export const createExpenseSchema = expenseSchema.extend({
  idempotencyKey: z.uuid(),
});

export const updateExpenseSchema = expenseSchema.extend({
  id: z.uuid(),
});

export const cancelExpenseSchema = z.object({
  id: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, "Give a reason")
    .max(200, "Keep the reason to 200 characters"),
});

export const expenseCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(40, "Name must be 40 characters or fewer"),
});

export const updateExpenseCategorySchema = expenseCategorySchema.extend({
  id: z.uuid(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type CancelExpenseInput = z.infer<typeof cancelExpenseSchema>;
export type ExpenseCategoryInput = z.infer<typeof expenseCategorySchema>;
export type UpdateExpenseCategoryInput = z.infer<
  typeof updateExpenseCategorySchema
>;
