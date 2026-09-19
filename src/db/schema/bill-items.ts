import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { bills } from "./bills";
import { items } from "./items";

/** Rupees, exact to two decimals. The driver returns these as strings. */
const money = (name: string) => numeric(name, { precision: 10, scale: 2 });

/**
 * An immutable snapshot of one sold line.
 *
 * itemName, categoryName and unitPrice are COPIED at sale time. Never join to
 * `items` for these values in a report — that would let a rename or a price
 * change rewrite history. See spec §6 Principle 2.
 *
 * A database trigger rejects every UPDATE and DELETE on this table.
 */
export const billItems = pgTable(
  "bill_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "restrict" }),
    // Retained for analytics only, never for name or price.
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),

    itemName: text("item_name").notNull(),
    categoryName: text("category_name").notNull(),
    unitPrice: money("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: money("line_total").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("bill_items_quantity_positive", sql`${table.quantity} > 0`),
    check("bill_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
    check(
      "bill_items_line_total_matches",
      sql`${table.lineTotal} = ${table.unitPrice} * ${table.quantity}`,
    ),
    index("bill_items_bill_id_idx").on(table.billId),
    index("bill_items_item_id_idx").on(table.itemId),
  ],
);

export type BillItem = typeof billItems.$inferSelect;
export type NewBillItem = typeof billItems.$inferInsert;
