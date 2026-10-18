import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { categories } from "./categories";
import { users } from "./users";

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Rupees as an exact decimal, e.g. 60.50. Never a float — see spec §6
    // Principle 1. Comes back from the driver as the string "60.50".
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    imageUrl: text("image_url"),
    // ImageKit fileId — required to delete or replace the image.
    imageFileId: text("image_file_id"),
    // Retired from the menu. Past bills still reference it.
    isActive: boolean("is_active").notNull().default(true),
    // Temporarily sold out: still shown, greyed out, cannot be billed.
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    // Off = the item bills exactly as it did before stock existed. Whole units
    // only. The count changes only through stock-service.ts, always alongside
    // a stock_movements row. See the stock spec §6.1.
    trackStock: boolean("track_stock").notNull().default(false),
    stockQuantity: integer("stock_quantity").notNull().default(0),
    // At or below this the item reads "Low". 0 = never low.
    lowStockThreshold: integer("low_stock_threshold").notNull().default(10),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("items_price_non_negative", sql`${table.price} >= 0`),
    // The last line of defence: no race or bug can oversell past zero.
    check("items_stock_non_negative", sql`${table.stockQuantity} >= 0`),
    check(
      "items_low_stock_threshold_non_negative",
      sql`${table.lowStockThreshold} >= 0`,
    ),
    index("items_category_active_idx")
      .on(table.categoryId)
      .where(sql`${table.isActive}`),
    uniqueIndex("items_category_name_lower_idx")
      .on(table.categoryId, sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
  ],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
