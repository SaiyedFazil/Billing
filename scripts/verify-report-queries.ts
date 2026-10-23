import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { add, compare, subtract, ZERO } from "../src/lib/utils/money";
import { getReceipt, listBills } from "../src/server/bills/bills-queries";
import { createBill } from "../src/server/bills/create-bill-service";
import { getCashBook } from "../src/server/expenses/expenses-queries";
import { getMenu } from "../src/server/items/items-queries";
import {
  getDashboardStats,
  getItemSales,
  getPaymentBreakdown,
  getSalesByDay,
  hasSplitBills,
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
  check("dashboard net matches SQL", compare(stats.net, truth.net) === 0, {
    stats: stats.net,
    sql: truth.net,
  });
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
    {
      items: itemSales.reduce((s, r) => add(s, r.revenue), ZERO),
      net: stats.net,
    },
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

  // --- data audit: every bill's payment lines ----------------------------
  // Voided bills included. Run after db:migrate on a copy of the live data:
  // the backfill must leave every bill paid exactly as it was. Spec §6.4.
  const [unbalanced] = (
    await db.execute(sql`
      SELECT count(*)::int AS n FROM bills b
      WHERE b.total <> coalesce(
        (SELECT sum(p.amount) FROM bill_payments p WHERE p.bill_id = b.id), 0)`)
  ).rows as Array<{ n: number }>;
  check("every bill's payment lines add up to its total", unbalanced.n === 0, {
    bills: unbalanced.n,
  });

  const [mismatched] = (
    await db.execute(sql`
      SELECT count(*)::int AS n FROM bills b
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
        )`)
  ).rows as Array<{ n: number }>;
  check(
    "every one-method bill has exactly one matching line",
    mismatched.n === 0,
    { bills: mismatched.n },
  );

  // --- a split bill is counted under each method it used -------------------
  // Read both reports, save a CASH + UPI split bill, read them again. The
  // bill's id and cash part stay in variables for the checks that follow.
  const today = stats.businessDate;
  const methodNet = (rows: Awaited<ReturnType<typeof getPaymentBreakdown>>) =>
    new Map(rows.map((row) => [row.paymentMethod, row.net]));
  const sumNet = (rows: Awaited<ReturnType<typeof getPaymentBreakdown>>) =>
    rows.reduce((sum, row) => add(sum, row.net), ZERO);

  const paymentsBefore = await getPaymentBreakdown(today, today);
  const cashBookBefore = await getCashBook(today, today);

  const [superadmin] = (
    await db.execute(
      sql`SELECT id FROM users WHERE role = 'SUPERADMIN' LIMIT 1`,
    )
  ).rows as Array<{ id: string }>;
  const menu = await getMenu();
  const splitItem = menu[0]?.items[0];

  if (!superadmin || !splitItem) {
    throw new Error(
      "No superadmin or menu found. Run `npm run db:seed` first.",
    );
  }

  const splitTotal = splitItem.price;
  const splitCash = subtract(splitTotal, "10.00");
  const splitSaved = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: splitItem.id, quantity: 1 }],
      discount: "0.00",
      paymentMethod: "SPLIT",
      tendered: null,
      splitPayments: [
        { method: "CASH", amount: splitCash },
        { method: "UPI", amount: "10.00" },
      ],
      expectedTotal: splitTotal,
    },
    superadmin.id,
  );
  if (!splitSaved.ok) {
    throw new Error(
      `The split probe bill did not save: ${splitSaved.error.message}`,
    );
  }
  const splitBillId = splitSaved.data.id;

  const paymentsAfter = await getPaymentBreakdown(today, today);
  const cashBookAfter = await getCashBook(today, today);
  const netBefore = methodNet(paymentsBefore);
  const netAfter = methodNet(paymentsAfter);
  const delta = (after: string | undefined, before: string | undefined) =>
    subtract(after ?? ZERO, before ?? ZERO);

  check(
    "a split adds its cash part to Cash",
    compare(delta(netAfter.get("CASH"), netBefore.get("CASH")), splitCash) ===
      0,
    { before: netBefore.get("CASH"), after: netAfter.get("CASH"), splitCash },
  );
  check(
    "a split adds its UPI part to UPI",
    compare(delta(netAfter.get("UPI"), netBefore.get("UPI")), "10.00") === 0,
    { before: netBefore.get("UPI"), after: netAfter.get("UPI") },
  );
  check(
    "a split bill counts once in Net",
    compare(
      subtract(sumNet(paymentsAfter), sumNet(paymentsBefore)),
      splitTotal,
    ) === 0,
    {
      before: sumNet(paymentsBefore),
      after: sumNet(paymentsAfter),
      splitTotal,
    },
  );
  check(
    "the Cash book splits it too",
    compare(
      subtract(
        cashBookAfter.summary.moneyIn.cash,
        cashBookBefore.summary.moneyIn.cash,
      ),
      splitCash,
    ) === 0 &&
      compare(
        subtract(
          cashBookAfter.summary.moneyIn.online,
          cashBookBefore.summary.moneyIn.online,
        ),
        "10.00",
      ) === 0,
    {
      before: cashBookBefore.summary.moneyIn,
      after: cashBookAfter.summary.moneyIn,
      splitBillId,
    },
  );

  check(
    "hasSplitBills sees today's split",
    (await hasSplitBills(today, today)) === true,
  );

  // --- the Bills list and the receipt show a split bill's lines -----------
  const ledgerWhere = { from: today, to: today };
  const splitOnly = await listBills(
    { ...ledgerWhere, paymentMethod: "SPLIT" },
    1,
    200,
  );
  check(
    "the Split filter finds only split bills",
    splitOnly.rows.length > 0 &&
      splitOnly.rows.every((row) => row.paymentMethod === "SPLIT") &&
      splitOnly.rows.some((row) => row.id === splitBillId),
    splitOnly.rows.map((row) => row.paymentMethod),
  );

  const upiOnly = await listBills(
    { ...ledgerWhere, paymentMethod: "UPI" },
    1,
    200,
  );
  check(
    "filtering by UPI finds split bills with a UPI line",
    upiOnly.rows.some((row) => row.id === splitBillId),
    upiOnly.rows.map((row) => row.id),
  );

  const splitRow = splitOnly.rows.find((row) => row.id === splitBillId);
  check(
    "split rows carry their payments as strings",
    splitOnly.rows.every(
      (row) =>
        row.splitPayments !== null &&
        row.splitPayments.length >= 2 &&
        row.splitPayments.every((part) => /^\d+\.\d{2}$/.test(part.amount)) &&
        compare(
          row.splitPayments.reduce((sum, part) => add(sum, part.amount), ZERO),
          row.total,
        ) === 0,
    ) && splitRow?.splitPayments?.length === 2,
    splitOnly.rows.map((row) => row.splitPayments),
  );

  const allToday = await listBills(ledgerWhere, 1, 200);
  check(
    "a one-method row has no split payments",
    allToday.rows
      .filter((row) => row.paymentMethod !== "SPLIT")
      .every((row) => row.splitPayments === null),
  );

  const splitReceipt = await getReceipt(splitBillId);
  check(
    "the receipt lists a split bill's payments",
    splitReceipt !== null &&
      splitReceipt.payments.length === 2 &&
      splitReceipt.payments[0].method === "CASH" &&
      splitReceipt.payments[1].method === "UPI" &&
      compare(splitReceipt.payments[0].amount, splitCash) === 0 &&
      compare(splitReceipt.payments[1].amount, "10.00") === 0,
    splitReceipt?.payments,
  );

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
