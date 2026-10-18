import { z } from "zod";

import {
  ADJUST_MODES,
  ADJUST_REASONS,
  MAX_STOCK,
  REASONS_FOR_MODE,
} from "@/lib/utils/stock";

/** The wire contract for the Update stock dialog. */
export const adjustStockSchema = z
  .object({
    itemId: z.uuid("Invalid item"),
    mode: z.enum(ADJUST_MODES),
    quantity: z
      .number()
      .int("Enter a whole number")
      .min(0, "Enter a whole number")
      .max(MAX_STOCK, `Must be ${MAX_STOCK.toLocaleString("en-IN")} or less`),
    reason: z.enum(ADJUST_REASONS),
    note: z
      .string()
      .trim()
      .max(200, "Keep the note to 200 characters")
      .nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.mode !== "SET" && value.quantity < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["quantity"],
        message: "Enter at least 1",
      });
    }
    if (!REASONS_FOR_MODE[value.mode].includes(value.reason)) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Choose a reason",
      });
    }
  });

export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
