import { sql } from "drizzle-orm";
import {
  check,
  index,
  numeric,
  pgTable,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import type { PaymentMethod } from "@/constants/payment-methods";

import { bills } from "./bills";
import { paymentMethodEnum } from "./enums";

/** Rupees, exact to two decimals. The driver returns these as strings. */
const money = (name: string) => numeric(name, { precision: 10, scale: 2 });

/**
 * How a bill was paid: the source of truth for every money-by-method figure.
 * A one-method bill has one line; a split bill has one line per method. See
 * the split payment spec §6.3.
 *
 * Database triggers enforce what a CHECK cannot:
 * - every UPDATE and DELETE is rejected, as on bill_items;
 * - at commit, a bill's lines must add up to its total and agree with the
 *   bill's payment_method (0009_bill_payments_guards.sql).
 */
export const billPayments = pgTable(
  "bill_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "restrict" }),
    // A real method only; the bill_payments_not_split CHECK refuses SPLIT.
    method: paymentMethodEnum("method").$type<PaymentMethod>().notNull(),
    // What this line pays toward the bill total.
    amount: money("amount").notNull(),
    // Cash handed over and change returned: the cash line only.
    tendered: money("tendered"),
    changeDue: money("change_due"),
    // Display order on the receipt and the bill details, from 1.
    position: smallint("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("bill_payments_not_split", sql`${table.method} <> 'SPLIT'`),
    // Zero only so a ₹0 bill (a 100% discount) still has its single line.
    // The balance trigger rejects a ₹0 line on a split bill.
    check("bill_payments_amount_non_negative", sql`${table.amount} >= 0`),
    check("bill_payments_position_positive", sql`${table.position} > 0`),
    // Both IS NOT NULLs are needed: with only one of the pair set, the
    // comparisons are NULL, and a CHECK that evaluates to NULL is treated as
    // satisfied — cash given with no change would go straight through.
    check(
      "bill_payments_tender_matches",
      sql`(${table.tendered} IS NULL AND ${table.changeDue} IS NULL) OR (${table.method} = 'CASH' AND ${table.tendered} IS NOT NULL AND ${table.changeDue} IS NOT NULL AND ${table.tendered} >= ${table.amount} AND ${table.changeDue} = ${table.tendered} - ${table.amount})`,
    ),
    // One line per method per bill. Also serves every lookup by bill.
    uniqueIndex("bill_payments_bill_method_idx").on(table.billId, table.method),
    uniqueIndex("bill_payments_bill_position_idx").on(
      table.billId,
      table.position,
    ),
    index("bill_payments_method_idx").on(table.method),
  ],
);

export type BillPayment = typeof billPayments.$inferSelect;
export type NewBillPayment = typeof billPayments.$inferInsert;
