import { sql } from "drizzle-orm";
import { check, integer, pgTable } from "drizzle-orm/pg-core";

/**
 * The shop's bill number sequence: ONE row, holding the last number issued.
 *
 * A bill number is never reused, so the sequence does not restart each day;
 * it counts every bill the shop has ever issued. Incremented inside the same
 * transaction as the bill insert, so a rolled-back bill also rolls back its
 * number — the sequence is genuinely gapless. A plain Postgres sequence would
 * leave a hole on every failed attempt, and holes in a bill sequence are
 * exactly what an auditor questions. See spec §6.7.
 */
export const billCounters = pgTable(
  "bill_counters",
  {
    id: integer("id").primaryKey().default(1),
    lastNumber: integer("last_number").notNull().default(0),
  },
  (table) => [check("bill_counters_single_row", sql`${table.id} = 1`)],
);

export type BillCounter = typeof billCounters.$inferSelect;
