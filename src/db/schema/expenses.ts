import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { expenseModeEnum } from "./enums";
import { expenseCategories } from "./expense-categories";
import { users } from "./users";

/** Rupees, exact to two decimals. The driver returns these as strings. */
const money = (name: string) => numeric(name, { precision: 10, scale: 2 });

/**
 * Money out, typed in by the owner. Money in is the bills table; nothing here
 * duplicates a sale.
 *
 * An expense is never deleted — a mistake is cancelled with a reason, and an
 * active expense may be edited. Triggers reject DELETE and any UPDATE of a
 * cancelled row. See the cash book spec §6.3.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The shop-local date the owner chose, not the moment it was typed.
    expenseDate: date("expense_date").notNull(),
    amount: money("amount").notNull(),
    mode: expenseModeEnum("mode").notNull(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => expenseCategories.id, { onDelete: "restrict" }),
    paidTo: text("paid_to"),
    note: text("note"),

    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => users.id),
    cancelReason: text("cancel_reason"),

    // Double-submit protection: a retry with the same key returns the
    // original expense instead of adding a second one.
    idempotencyKey: uuid("idempotency_key").notNull(),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("expenses_amount_positive", sql`${table.amount} > 0`),
    // Cancelled means all three are set; active means none are.
    check(
      "expenses_cancellation_complete",
      sql`(${table.cancelledAt} IS NULL) = (${table.cancelledBy} IS NULL)
        AND (${table.cancelledAt} IS NULL) = (${table.cancelReason} IS NULL)`,
    ),
    check(
      "expenses_paid_to_length",
      sql`${table.paidTo} IS NULL OR char_length(${table.paidTo}) BETWEEN 1 AND 80`,
    ),
    check(
      "expenses_note_length",
      sql`${table.note} IS NULL OR char_length(${table.note}) BETWEEN 1 AND 200`,
    ),
    check(
      "expenses_cancel_reason_length",
      sql`${table.cancelReason} IS NULL OR char_length(${table.cancelReason}) BETWEEN 1 AND 200`,
    ),
    index("expenses_expense_date_idx").on(table.expenseDate),
    index("expenses_category_idx").on(table.categoryId),
    uniqueIndex("expenses_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
