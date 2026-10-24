import { sql } from "drizzle-orm";

import {
  BILL_PAYMENT_METHOD_LABELS,
  type BillPaymentMethod,
} from "../src/constants/payment-methods";
import { db } from "../src/db";
import { shiftIsoDate } from "../src/lib/utils/date-range";
import { businessDate } from "../src/lib/utils/dates";
import { compare, toAmount } from "../src/lib/utils/money";
import { getShopTimezone } from "../src/server/settings/settings-queries";
import {
  type FlaggedBill,
  mismatchedOneMethodBills,
  unbalancedBills,
} from "./payment-audit/queries";

/**
 * `npm run db:audit-payments` — the go-live proof for split payment
 * (docs/deployment.md). Checks that every bill's payment lines agree with the
 * bill. Read-only: it runs SELECTs and nothing else, so it is safe on the live
 * database or a Neon branch of it. Exits 1 on any mismatch.
 */

/** The window the owner compares on the Sales and Cash book pages. */
const DAYS = 90;
/** Enough bill numbers to start looking; the count says how many in all. */
const SHOW_AT_MOST = 10;

let failures = 0;

function audit(label: string, flagged: FlaggedBill[]) {
  if (flagged.length === 0) {
    console.log(`PASS — ${label}`);
    return;
  }
  failures += 1;
  const shown = flagged
    .slice(0, SHOW_AT_MOST)
    .map((bill) => `#${bill.billNumber} on ${bill.businessDate}`);
  const more = flagged.length - shown.length;
  console.log(
    `FAIL — ${label}: ${flagged.length} bill(s) do not, ` +
      shown.join(", ") +
      (more > 0 ? `, and ${more} more` : ""),
  );
}

async function main() {
  const [table] = (
    await db.execute(
      sql`SELECT to_regclass('bill_payments') IS NOT NULL AS present`,
    )
  ).rows as Array<{ present: boolean }>;
  if (!table.present) {
    console.log("FAIL — the bill_payments table is missing; run db:migrate");
    process.exit(1);
  }

  audit(
    "every bill's payment lines add up to its total",
    await unbalancedBills(),
  );
  audit(
    "every one-method bill has exactly one line that matches it",
    await mismatchedOneMethodBills(),
  );

  // Before split payment, the Sales report and the Cash book grouped
  // bills.total by bills.payment_method; now they read bill_payments. For
  // one-method bills the two must agree to the paisa. Split bills have no
  // "before", so they are left out.
  const timeZone = await getShopTimezone();
  const to = businessDate(new Date(), timeZone);
  const from = shiftIsoDate(to, -(DAYS - 1));

  const rows = (
    await db.execute(sql`
      WITH recent AS (
        SELECT id, payment_method, total FROM bills
        WHERE status = 'COMPLETED' AND payment_method <> 'SPLIT'
          AND business_date BETWEEN ${from} AND ${to}
      ),
      from_bills AS (
        SELECT payment_method AS method, sum(total) AS amount
        FROM recent GROUP BY payment_method
      ),
      from_lines AS (
        SELECT p.method, sum(p.amount) AS amount
        FROM bill_payments p JOIN recent r ON r.id = p.bill_id
        GROUP BY p.method
      )
      SELECT coalesce(fb.method, fl.method)::text AS method,
        coalesce(fb.amount, 0)::text AS bills,
        coalesce(fl.amount, 0)::text AS lines
      FROM from_bills fb FULL JOIN from_lines fl ON fl.method = fb.method
      ORDER BY coalesce(fb.method, fl.method)`)
  ).rows as Array<{ method: BillPaymentMethod; bills: string; lines: string }>;

  console.log(`\nCompleted one-method bills, ${from} to ${to}:`);
  if (rows.length === 0) {
    console.log("(none in this range)");
  } else {
    console.table(
      rows.map((row) => ({
        Method: BILL_PAYMENT_METHOD_LABELS[row.method] ?? row.method,
        "Bill totals": toAmount(row.bills),
        "Payment lines": toAmount(row.lines),
        Match: compare(row.bills, row.lines) === 0 ? "yes" : "NO",
      })),
    );
  }

  const differing = rows.filter((row) => compare(row.bills, row.lines) !== 0);
  if (differing.length === 0) {
    console.log(`PASS — the last ${DAYS} days agree for every method`);
  } else {
    failures += 1;
    console.log(
      `FAIL — the last ${DAYS} days differ for ` +
        differing
          .map((row) => BILL_PAYMENT_METHOD_LABELS[row.method] ?? row.method)
          .join(", "),
    );
  }

  console.log(
    failures === 0
      ? "\nAll payment audits passed. Nothing was written."
      : `\n${failures} FAILURE(S). Nothing was written.`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
