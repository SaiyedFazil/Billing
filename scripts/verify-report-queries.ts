import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { add, compare, subtract, ZERO } from "../src/lib/utils/money";
import {
  getDashboardStats,
  getItemSales,
  getPaymentBreakdown,
  getSalesByDay,
} from "../src/server/reports/reports-queries";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  const stats = await getDashboardStats();
  console.log("dashboard:", stats);

  // Cross-check the dashboard against a plain SQL sum.
  const [truth] = (
    await db.execute(sql`
      SELECT count(*)::int AS n, coalesce(sum(total), 0)::text AS net
      FROM bills WHERE business_date = ${stats.businessDate} AND status = 'COMPLETED'`)
  ).rows as Array<{ n: number; net: string }>;

  check("dashboard bill count matches SQL", stats.billCount === truth.n, {
    stats: stats.billCount,
    sql: truth.n,
  });
  check(
    "dashboard net matches SQL",
    compare(stats.net, truth.net) === 0,
    { stats: stats.net, sql: truth.net },
  );
  check(
    "every money figure is a two-decimal rupee string",
    [stats.gross, stats.net, stats.averageBill].every((value) =>
      /^-?\d+\.\d{2}$/.test(value),
    ),
    stats,
  );

  const days = await getSalesByDay(stats.businessDate, stats.businessDate);
  check(
    "sales-by-day net equals the dashboard net",
    compare(days[0]?.net ?? ZERO, stats.net) === 0,
    days,
  );
  check(
    "gross - discount = net for every day",
    days.every((d) => compare(subtract(d.gross, d.discount), d.net) === 0),
    days,
  );

  const payments = await getPaymentBreakdown(
    stats.businessDate,
    stats.businessDate,
  );
  check(
    "payment breakdown sums to the day's net",
    compare(
      payments.reduce((sum, p) => add(sum, p.net), ZERO),
      stats.net,
    ) === 0,
    payments,
  );

  const itemSales = await getItemSales(stats.businessDate, stats.businessDate);
  console.table(itemSales);
  const shareSum = itemSales.reduce((sum, r) => sum + r.sharePercent, 0);
  check(
    "item shares total roughly 100% (or none with no sales)",
    itemSales.length === 0 || Math.abs(shareSum - 100) < 0.5,
    shareSum,
  );
  check(
    "item revenue sums to the day's net",
    itemSales.length === 0 ||
      compare(
        itemSales.reduce((sum, r) => add(sum, r.revenue), ZERO),
        add(stats.net, stats.discount),
      ) === 0,
    { items: itemSales.reduce((s, r) => add(s, r.revenue), ZERO), net: stats.net },
  );

  // A voided bill must not count as revenue.
  const [anyBill] = (
    await db.execute(
      sql`SELECT id, total FROM bills
          WHERE status = 'COMPLETED' AND business_date = ${stats.businessDate} LIMIT 1`,
    )
  ).rows as Array<{ id: string; total: string }>;

  if (anyBill) {
    await db.execute(
      sql`UPDATE bills SET status = 'VOID', voided_at = now(), void_reason = 'probe'
          WHERE id = ${anyBill.id}::uuid`,
    );
    const afterVoid = await getDashboardStats();
    check(
      "voiding a bill removes it from revenue",
      compare(afterVoid.net, subtract(stats.net, anyBill.total)) === 0,
      { before: stats.net, after: afterVoid.net, voided: anyBill.total },
    );
    await db.execute(
      sql`UPDATE bills SET status = 'COMPLETED', voided_at = NULL, void_reason = NULL
          WHERE id = ${anyBill.id}::uuid`,
    );
  } else {
    console.log("SKIP — no completed bill available to void-test");
  }

  console.log(
    failures === 0
      ? "\nAll report query checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
