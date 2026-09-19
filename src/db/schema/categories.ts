import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Controls the order of the tabs on the billing screen.
    sortOrder: integer("sort_order").notNull().default(0),
    // Soft delete. Past bills keep their snapshot of the category name.
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Only live categories must be uniquely named; retired ones may collide.
    uniqueIndex("categories_name_lower_idx")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
