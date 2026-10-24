import { sql } from "drizzle-orm";

import { db } from "../../src/db";

/**
 * The payment-line audits, shared by `npm run db:audit-payments` (read-only,
 * safe on live data) and `npm run verify:report-queries`. SELECTs only.
 *
 * Voided bills are included: a void changes a bill's status, never how it was
 * paid. The migration's backfill must leave every bill paid exactly as it was.
 * Split payment spec §6.3–6.4.
 */

/** A bill the audit flags, as the owner would find it on the Bills page. */
export type FlaggedBill = { businessDate: string; billNumber: number };

/** Bills whose payment lines do not add up to the bill's total. */
export async function unbalancedBills(): Promise<FlaggedBill[]> {
  const result = await db.execute(sql`
    SELECT b.business_date::text AS "businessDate",
      b.bill_number AS "billNumber"
    FROM bills b
    WHERE b.total <> coalesce(
      (SELECT sum(p.amount) FROM bill_payments p WHERE p.bill_id = b.id), 0)
    ORDER BY b.business_date, b.bill_number`);
  return result.rows as FlaggedBill[];
}

/**
 * One-method bills without exactly one line that repeats the bill's method,
 * total, cash given and change. IS DISTINCT FROM, so a value on one side and
 * NULL on the other is a mismatch rather than unknown.
 */
export async function mismatchedOneMethodBills(): Promise<FlaggedBill[]> {
  const result = await db.execute(sql`
    SELECT b.business_date::text AS "businessDate",
      b.bill_number AS "billNumber"
    FROM bills b
    WHERE b.payment_method <> 'SPLIT'
      AND (
        (SELECT count(*) FROM bill_payments p WHERE p.bill_id = b.id) <> 1
        OR EXISTS (
          SELECT 1 FROM bill_payments p
          WHERE p.bill_id = b.id
            AND (p.method, p.amount, p.tendered, p.change_due)
                IS DISTINCT FROM
                (b.payment_method, b.total, b.tendered, b.change_due)
        )
      )
    ORDER BY b.business_date, b.bill_number`);
  return result.rows as FlaggedBill[];
}
