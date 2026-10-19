import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * The owner's own labels for money out (Gas, Salary, Rent…). Seeded by
 * migration 0006 so the live shop gets them on db:migrate.
 *
 * A trigger rejects DELETE: a category is retired, never removed, because old
 * expenses still point at it. See the cash book spec §6.2.
 */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    // Soft delete ("retire"). Retired categories leave the picker but keep
    // naming their old expenses.
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "expense_categories_name_length",
      sql`char_length(${table.name}) BETWEEN 1 AND 40`,
    ),
    // Only live categories must be uniquely named; retired ones may collide.
    uniqueIndex("expense_categories_name_lower_idx")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
  ],
);

export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type NewExpenseCategory = typeof expenseCategories.$inferInsert;
