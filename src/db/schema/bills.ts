import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { billStatusEnum, paymentMethodEnum } from "./enums";
import { users } from "./users";

/** Rupees, exact to two decimals. The driver returns these as strings. */
const money = (name: string) => numeric(name, { precision: 10, scale: 2 });

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billNumber: integer("bill_number").notNull(),
    // Shop-local date, computed in application code so the day boundary is
    // unambiguous at midnight. See spec §6.11.
    businessDate: date("business_date").notNull(),

    subtotal: money("subtotal").notNull(),
    // A flat rupee amount, never a percentage.
    discount: money("discount").notNull().default("0.00"),
    total: money("total").notNull(),

    // One real method, or SPLIT when bill_payments holds two or more lines.
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    tendered: money("tendered"),
    changeDue: money("change_due"),

    status: billStatusEnum("status").notNull().default("COMPLETED"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidReason: text("void_reason"),

    // Double-submit protection: a retry with the same key returns the
    // original bill instead of creating a second one. See spec §8.4.
    idempotencyKey: uuid("idempotency_key").notNull(),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bills_date_number_idx").on(
      table.businessDate,
      table.billNumber,
    ),
    uniqueIndex("bills_idempotency_key_idx").on(table.idempotencyKey),

    // These hold because numeric is exact. They would fail under float, which
    // is why this application never uses one for money.
    check("bills_subtotal_non_negative", sql`${table.subtotal} >= 0`),
    check("bills_discount_non_negative", sql`${table.discount} >= 0`),
    check(
      "bills_discount_within_subtotal",
      sql`${table.discount} <= ${table.subtotal}`,
    ),
    check(
      "bills_total_matches",
      sql`${table.total} = ${table.subtotal} - ${table.discount}`,
    ),
    check(
      "bills_change_matches",
      sql`${table.tendered} IS NULL OR ${table.changeDue} = ${table.tendered} - ${table.total}`,
    ),
    // A split bill's cash given and change live on its cash payment line.
    check(
      "bills_split_has_no_tender",
      sql`${table.paymentMethod} <> 'SPLIT' OR (${table.tendered} IS NULL AND ${table.changeDue} IS NULL)`,
    ),

    index("bills_business_date_idx").on(table.businessDate),
    index("bills_created_at_idx").on(table.createdAt),
    index("bills_created_by_idx").on(table.createdBy),
    index("bills_payment_method_idx").on(table.paymentMethod),
  ],
);

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
