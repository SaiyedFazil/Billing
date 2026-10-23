import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { add, compare, lineTotal, subtract } from "../src/lib/utils/money";
import { createBill } from "../src/server/bills/create-bill-service";
import { getMenu } from "../src/server/items/items-queries";

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
  const userRow = await db.execute(
    sql`SELECT id FROM users WHERE role = 'SUPERADMIN' LIMIT 1`,
  );
  const userId = (userRow.rows[0] as { id: string } | undefined)?.id;
  if (!userId) {
    throw new Error("No superadmin found. Run `npm run db:seed` first.");
  }

  const menu = await getMenu();
  if (menu.length < 2) {
    throw new Error("Menu is empty. Run `npm run db:seed` first.");
  }

  const first = menu[0].items[0];
  const second = menu[menu.length - 1].items[0];

  // subtotal = (first x 2) + second, minus a Rs.10 discount.
  const subtotal = add(lineTotal(first.price, 2), lineTotal(second.price, 1));
  const expectedTotal = subtract(subtotal, "10.00");

  // --- a normal bill ---------------------------------------------------
  const key = crypto.randomUUID();
  const result = await createBill(
    {
      idempotencyKey: key,
      lines: [
        { itemId: first.id, quantity: 2 },
        { itemId: second.id, quantity: 1 },
      ],
      discount: "10.00",
      paymentMethod: "CASH",
      tendered: "500.00",
      expectedTotal,
    },
    userId,
  );

  check("bill saved", result.ok, result.ok ? "" : result.error);
  if (!result.ok) process.exit(1);
  check("total matches", compare(result.data.total, expectedTotal) === 0, {
    got: result.data.total,
    expected: expectedTotal,
  });
  check(
    "total is stored as a rupee decimal, not paise",
    /^\d+\.\d{2}$/.test(result.data.total),
    result.data.total,
  );

  // --- the bill's payment line ---------------------------------------------
  // Every amount crosses as ::text, so the comparison is exact.
  const paymentsRow = await db.execute(sql`
    SELECT method::text AS method, amount::text AS amount,
           tendered::text AS tendered, change_due::text AS change_due, position
    FROM bill_payments WHERE bill_id = ${result.data.id}::uuid
    ORDER BY position`);
  const expectedPayments = [
    {
      method: "CASH",
      amount: expectedTotal,
      tendered: "500.00",
      change_due: subtract("500.00", expectedTotal),
      position: 1,
    },
  ];
  check(
    "a one-method bill writes exactly one matching line",
    JSON.stringify(paymentsRow.rows) === JSON.stringify(expectedPayments),
    { got: paymentsRow.rows, expected: expectedPayments },
  );

  // --- idempotency: the single most important behaviour -----------------
  const repeat = await createBill(
    {
      idempotencyKey: key,
      lines: [
        { itemId: first.id, quantity: 2 },
        { itemId: second.id, quantity: 1 },
      ],
      discount: "10.00",
      paymentMethod: "CASH",
      tendered: "500.00",
      expectedTotal,
    },
    userId,
  );
  check(
    "retry with the same key returns the same bill",
    repeat.ok && repeat.data.id === result.data.id,
    repeat,
  );

  const countRow = await db.execute(
    sql`SELECT count(*)::int AS n FROM bills WHERE idempotency_key = ${key}::uuid`,
  );
  const { n } = countRow.rows[0] as { n: number };
  check("only one row was written", n === 1, { rows: n });

  // --- a stale expected total is caught ---------------------------------
  const stale = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: first.id, quantity: 1 }],
      discount: "0.00",
      paymentMethod: "UPI",
      tendered: null,
      expectedTotal: "0.01",
    },
    userId,
  );
  check(
    "a stale expected total is rejected with PRICE_CHANGED",
    !stale.ok && stale.error.code === "PRICE_CHANGED",
    stale,
  );

  // --- a discount larger than the subtotal is rejected -------------------
  const overDiscount = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: first.id, quantity: 1 }],
      discount: "99999.00",
      paymentMethod: "CASH",
      tendered: "0.00",
      expectedTotal: "0.00",
    },
    userId,
  );
  check(
    "a discount larger than the subtotal is rejected",
    !overDiscount.ok && overDiscount.error.code === "VALIDATION",
    overDiscount,
  );

  // --- tendering less than the total is rejected -------------------------
  const shortPaid = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: first.id, quantity: 1 }],
      discount: "0.00",
      paymentMethod: "CASH",
      tendered: "0.01",
      expectedTotal: first.price,
    },
    userId,
  );
  check(
    "tendering less than the total is rejected",
    !shortPaid.ok && shortPaid.error.code === "VALIDATION",
    shortPaid,
  );

  // --- a sold-out item is rejected ---------------------------------------
  await db.execute(
    sql`UPDATE items SET is_available = false WHERE id = ${first.id}::uuid`,
  );
  const soldOut = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: first.id, quantity: 1 }],
      discount: "0.00",
      paymentMethod: "UPI",
      tendered: null,
      expectedTotal: first.price,
    },
    userId,
  );
  check(
    "a sold-out item is rejected with CONFLICT",
    !soldOut.ok && soldOut.error.code === "CONFLICT",
    soldOut,
  );
  await db.execute(
    sql`UPDATE items SET is_available = true WHERE id = ${first.id}::uuid`,
  );

  // --- a switched-off payment method is rejected -------------------------
  // The till never draws the button, but a server action is a public endpoint.
  await db.execute(
    sql`UPDATE shop_settings SET payment_methods = '{CASH}'::payment_method[]`,
  );
  const disabledMethod = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: first.id, quantity: 1 }],
      discount: "0.00",
      paymentMethod: "UPI",
      tendered: null,
      expectedTotal: first.price,
    },
    userId,
  );
  check(
    "a switched-off payment method is rejected with CONFLICT",
    !disabledMethod.ok && disabledMethod.error.code === "CONFLICT",
    disabledMethod,
  );
  await db.execute(
    sql`UPDATE shop_settings
        SET payment_methods = '{CASH,UPI,CARD,OTHER}'::payment_method[]`,
  );

  // --- snapshots ---------------------------------------------------------
  const linesRow = await db.execute(sql`
    SELECT item_name, category_name, unit_price, quantity, line_total
    FROM bill_items WHERE bill_id = ${result.data.id}::uuid
    ORDER BY item_name`);
  check(
    "two snapshot lines written",
    linesRow.rows.length === 2,
    linesRow.rows,
  );
  console.table(linesRow.rows);

  check(
    "snapshot prices are rupee decimals",
    linesRow.rows.every((row) =>
      /^\d+\.\d{2}$/.test(String((row as { unit_price: string }).unit_price)),
    ),
    linesRow.rows,
  );

  // --- gapless numbering --------------------------------------------------
  const numbersRow = await db.execute(sql`
    SELECT bill_number FROM bills
    WHERE business_date = ${result.data.businessDate}
    ORDER BY bill_number`);
  const numbers = numbersRow.rows.map(
    (r) => (r as { bill_number: number }).bill_number,
  );
  const gapless = numbers.every((value, index) => value === numbers[0] + index);
  check("bill numbers are contiguous for the day", gapless, numbers);

  // --- the counter has not run ahead of the bills --------------------------
  const counterRow = await db.execute(sql`
    SELECT c.business_date, c.last_number,
           (SELECT count(*)::int FROM bills b WHERE b.business_date = c.business_date) AS bills
    FROM bill_counters c`);
  console.table(counterRow.rows);
  const noBurnedNumbers = counterRow.rows.every(
    (r) =>
      (r as { last_number: number; bills: number }).last_number ===
      (r as { last_number: number; bills: number }).bills,
  );
  check(
    "no bill numbers were burned by a failed attempt",
    noBurnedNumbers,
    counterRow.rows,
  );

  console.log(
    failures === 0 ? "\nAll bill checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
