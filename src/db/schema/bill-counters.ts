import { date, integer, pgTable } from "drizzle-orm/pg-core";

/**
 * One row per business date, holding that day's last issued bill number.
 *
 * Incremented inside the same transaction as the bill insert, so a rolled-back
 * bill also rolls back its number — the sequence is genuinely gapless. A plain
 * Postgres sequence would leave a hole on every failed attempt, and holes in a
 * bill sequence are exactly what an auditor questions. See spec §6.7.
 */
export const billCounters = pgTable("bill_counters", {
  businessDate: date("business_date").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

export type BillCounter = typeof billCounters.$inferSelect;
