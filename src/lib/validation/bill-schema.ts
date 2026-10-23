import { z } from "zod";

import {
  BILL_PAYMENT_METHODS,
  PAYMENT_METHODS,
} from "@/constants/payment-methods";
import { MAX_SPLIT_LINES } from "@/lib/utils/bill-payments";

export const MAX_LINE_QUANTITY = 99;

/** Rupees with at most two decimals, e.g. "60.50". Must match money.ts. */
const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Money crosses the wire as a decimal STRING, never a number — JSON numbers
 * are IEEE-754 doubles, so serialising "110.79" as a number would reintroduce
 * exactly the float error this application avoids.
 */
const amount = (label: string) =>
  z
    .string()
    .trim()
    .regex(RUPEE_PATTERN, `${label} must be an amount like 60.50`);

const lineSchema = z.object({
  itemId: z.uuid("Invalid item"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(MAX_LINE_QUANTITY, `Quantity cannot exceed ${MAX_LINE_QUANTITY}`),
});

/**
 * The wire contract for saving a bill.
 *
 * There is deliberately no price field on lineSchema. If a future change adds
 * one, that is a security regression — the server must always re-read prices.
 */
export const createBillSchema = z.object({
  idempotencyKey: z.uuid(),
  lines: z.array(lineSchema).min(1, "Add at least one item to the bill"),
  discount: amount("Discount"),
  paymentMethod: z.enum(BILL_PAYMENT_METHODS),
  tendered: amount("Amount tendered").nullable(),
  // Only for a SPLIT bill. A line is never SPLIT itself.
  splitPayments: z
    .array(
      z.object({
        method: z.enum(PAYMENT_METHODS),
        amount: amount("Payment"),
      }),
    )
    .max(MAX_SPLIT_LINES)
    .nullish(),
  expectedTotal: amount("Total"),
});

export type CreateBillPayload = z.infer<typeof createBillSchema>;
