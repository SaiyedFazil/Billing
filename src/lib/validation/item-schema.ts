import { z } from "zod";

/** Rupees with at most two decimals. Must match money.ts. */
const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

export const itemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer"),
  categoryId: z.uuid("Choose a category"),
  // A decimal STRING, already normalised by the form via parseRupees(). Not a
  // number: a JSON number is an IEEE-754 double and would lose exactness in
  // transit, which is the whole reason money is stored as numeric(10,2).
  price: z
    .string()
    .trim()
    .regex(RUPEE_PATTERN, "Price must be an amount like 60.50")
    .refine(
      (value) => Number(value) <= 100_000,
      "Price is unrealistically high",
    ),
  imageUrl: z.url("Invalid image URL").nullable(),
  imageFileId: z.string().min(1).nullable(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
});

export const updateItemSchema = itemSchema.extend({ id: z.uuid() });

export type ItemInput = z.infer<typeof itemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
