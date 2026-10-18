import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { bills } from "./bills";
import { stockMovementTypeEnum } from "./enums";
import { items } from "./items";
import { users } from "./users";

/**
 * The append-only ledger behind every stock count. See the stock spec §6.2.
 *
 * Invariant: for a tracked item, items.stock_quantity equals the
 * quantity_after of its latest row here. Both are written in one transaction.
 *
 * A database trigger rejects every UPDATE and DELETE on this table. A mistake
 * is corrected with a new CORRECTION row, never by editing an old one.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    type: stockMovementTypeEnum("type").notNull(),
    // Signed: +24 for a restock, -2 for a sale.
    quantityDelta: integer("quantity_delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    // Set for SALE only.
    billId: uuid("bill_id").references(() => bills.id, {
      onDelete: "restrict",
    }),
    note: text("note"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "stock_movements_bill_iff_sale",
      sql`(${table.billId} IS NOT NULL) = (${table.type} = 'SALE')`,
    ),
    // An opening count may equal the count already stored, e.g. 0 → 0.
    check(
      "stock_movements_delta_non_zero",
      sql`${table.quantityDelta} <> 0 OR ${table.type} = 'OPENING'`,
    ),
    check(
      "stock_movements_after_non_negative",
      sql`${table.quantityAfter} >= 0`,
    ),
    check(
      "stock_movements_note_length",
      sql`${table.note} IS NULL OR char_length(${table.note}) <= 200`,
    ),
    index("stock_movements_item_created_idx").on(
      table.itemId,
      table.createdAt.desc(),
    ),
    index("stock_movements_bill_idx").on(table.billId),
  ],
);

export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
