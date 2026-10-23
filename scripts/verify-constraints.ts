import { sql, type SQL } from "drizzle-orm";

import { db } from "../src/db";
import { add } from "../src/lib/utils/money";

let failures = 0;

async function expectRejection(label: string, statement: SQL) {
  try {
    await db.execute(statement);
    failures += 1;
    console.error(`FAIL — ${label}: the database ACCEPTED invalid data`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`PASS — ${label}: rejected (${message.split("\n")[0]})`);
  }
}

/** The full driver message, including the cause Drizzle wraps it in. */
function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const cause = (error as { cause?: unknown }).cause;
  return cause instanceof Error ? `${message} ${cause.message}` : message;
}

/**
 * Stricter than expectRejection: the statement must fail on the named
 * constraint, so a missing column or a typo cannot pass for a rejection.
 */
async function expectViolation(
  label: string,
  statement: SQL,
  constraint: string,
) {
  try {
    await db.execute(statement);
    failures += 1;
    console.error(`FAIL — ${label}: the database ACCEPTED invalid data`);
  } catch (error) {
    if (describe(error).includes(constraint)) {
      console.log(`PASS — ${label}: rejected by ${constraint}`);
    } else {
      failures += 1;
      console.error(
        `FAIL — ${label}: rejected, but not by ${constraint}:`,
        describe(error).split("\n")[0],
      );
    }
  }
}

/** The mirror of expectViolation: a valid statement must go through. */
async function expectAccepted(label: string, statement: SQL) {
  try {
    await db.execute(statement);
    console.log(`PASS — ${label}: accepted`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL — ${label}: rejected:`, describe(error).split("\n")[0]);
  }
}

async function main() {
  // --- fixtures -------------------------------------------------------
  // A user is needed for bills.created_by, a category for items.category_id.
  await db.execute(sql`
    INSERT INTO users (username, password_hash, name, role)
    VALUES ('constraint-probe', 'x', 'Probe', 'ADMIN')
    ON CONFLICT DO NOTHING
  `);
  await db.execute(sql`
    INSERT INTO categories (name) VALUES ('Constraint Probe Category')
    ON CONFLICT DO NOTHING
  `);

  const userId = (
    (
      await db.execute(
        sql`SELECT id FROM users WHERE username = 'constraint-probe'`,
      )
    ).rows[0] as { id: string }
  ).id;
  const categoryId = (
    (
      await db.execute(
        sql`SELECT id FROM categories WHERE name = 'Constraint Probe Category'`,
      )
    ).rows[0] as { id: string }
  ).id;

  // --- bills ----------------------------------------------------------
  await expectRejection(
    "total must equal subtotal minus discount",
    sql`INSERT INTO bills (bill_number, business_date, subtotal, discount,
        total, payment_method, idempotency_key, created_by)
        VALUES (9001, '2026-01-01', 100.00, 10.00, 99.99, 'CASH', gen_random_uuid(), ${userId}::uuid)`,
  );

  await expectRejection(
    "discount cannot exceed subtotal",
    sql`INSERT INTO bills (bill_number, business_date, subtotal, discount,
        total, payment_method, idempotency_key, created_by)
        VALUES (9002, '2026-01-01', 100.00, 200.00, -100.00, 'CASH', gen_random_uuid(), ${userId}::uuid)`,
  );

  await expectRejection(
    "change must equal tendered minus total",
    sql`INSERT INTO bills (bill_number, business_date, subtotal, discount,
        total, payment_method, tendered, change_due, idempotency_key, created_by)
        VALUES (9003, '2026-01-01', 100.00, 0.00, 100.00, 'CASH', 200.00, 50.00, gen_random_uuid(), ${userId}::uuid)`,
  );

  // --- items ----------------------------------------------------------
  await expectRejection(
    "item price cannot be negative",
    sql`INSERT INTO items (category_id, name, price)
        VALUES (${categoryId}::uuid, 'Negative Price Probe', -1.00)`,
  );

  // --- stock ----------------------------------------------------------
  const probeItemId = (
    (
      await db.execute(sql`
        INSERT INTO items (category_id, name, price)
        VALUES (${categoryId}::uuid, 'Stock Constraint Probe', 10.00)
        RETURNING id
      `)
    ).rows[0] as { id: string }
  ).id;

  await expectViolation(
    "stock cannot go negative",
    sql`UPDATE items SET stock_quantity = -1 WHERE id = ${probeItemId}::uuid`,
    "items_stock_non_negative",
  );
  await expectViolation(
    "the low-stock level cannot be negative",
    sql`UPDATE items SET low_stock_threshold = -1 WHERE id = ${probeItemId}::uuid`,
    "items_low_stock_threshold_non_negative",
  );
  await expectViolation(
    "a SALE movement must name its bill",
    sql`INSERT INTO stock_movements (item_id, type, quantity_delta, quantity_after, created_by)
        VALUES (${probeItemId}::uuid, 'SALE', -1, 0, ${userId}::uuid)`,
    "stock_movements_bill_iff_sale",
  );
  await expectViolation(
    "only a SALE movement may name a bill",
    sql`INSERT INTO stock_movements (item_id, type, quantity_delta, quantity_after, bill_id, created_by)
        VALUES (${probeItemId}::uuid, 'RESTOCK', 5, 5, gen_random_uuid(), ${userId}::uuid)`,
    "stock_movements_bill_iff_sale",
  );
  await expectViolation(
    "a RESTOCK cannot change nothing",
    sql`INSERT INTO stock_movements (item_id, type, quantity_delta, quantity_after, created_by)
        VALUES (${probeItemId}::uuid, 'RESTOCK', 0, 0, ${userId}::uuid)`,
    "stock_movements_delta_non_zero",
  );
  await expectViolation(
    "a movement cannot leave negative stock",
    sql`INSERT INTO stock_movements (item_id, type, quantity_delta, quantity_after, created_by)
        VALUES (${probeItemId}::uuid, 'WASTAGE', -1, -1, ${userId}::uuid)`,
    "stock_movements_after_non_negative",
  );
  await expectViolation(
    "a note is at most 200 characters",
    sql`INSERT INTO stock_movements (item_id, type, quantity_delta, quantity_after, note, created_by)
        VALUES (${probeItemId}::uuid, 'RESTOCK', 1, 1, ${"x".repeat(201)}, ${userId}::uuid)`,
    "stock_movements_note_length",
  );

  // An opening count of 0 is a real, valid save — the one zero-delta row.
  try {
    await db.execute(sql`
      INSERT INTO stock_movements (item_id, type, quantity_delta, quantity_after, created_by)
      VALUES (${probeItemId}::uuid, 'OPENING', 0, 0, ${userId}::uuid)
    `);
    console.log("PASS — a zero-delta OPENING movement is accepted");
  } catch (error) {
    failures += 1;
    console.error(
      "FAIL — a zero-delta OPENING movement was rejected:",
      describe(error).split("\n")[0],
    );
  }

  // --- bill_items -----------------------------------------------------
  await expectRejection(
    "line total must equal unit price times quantity",
    sql`INSERT INTO bill_items (bill_id, item_id, item_name, category_name,
        unit_price, quantity, line_total)
        VALUES (gen_random_uuid(), gen_random_uuid(), 'X', 'Y', 100.00, 2, 999.00)`,
  );

  // --- shop_settings singleton ----------------------------------------
  await expectRejection(
    "a second shop_settings row is refused",
    sql`INSERT INTO shop_settings (id, shop_name) VALUES (false, 'Second Row')`,
  );

  // --- shop_settings payment methods ----------------------------------
  // The shop must always have at least one way to take money.
  await expectRejection(
    "switching off every payment method is refused",
    sql`UPDATE shop_settings SET payment_methods = '{}'::payment_method[]`,
  );

  // --- bill_payments --------------------------------------------------
  // On a database that predates split payment this is one clean FAIL, not a
  // crash that would strand the probe rows above.
  if (await tableExists("bill_payments")) {
    await verifyBillPaymentConstraints(userId);
  } else {
    failures += 1;
    console.error("FAIL — the bill_payments table is missing; run db:migrate");
  }

  // --- expenses -------------------------------------------------------
  // On a database that predates the cash book this is one clean FAIL, not a
  // crash that would strand the probe rows above.
  if (await tableExists("expenses")) {
    await verifyExpenseConstraints(userId);
  } else {
    failures += 1;
    console.error("FAIL — the expenses table is missing; run db:migrate");
  }

  // --- cleanup --------------------------------------------------------
  // Payment lines and bills cannot be deleted by trigger; lift both for the
  // probe bills only. The table is absent before split payment.
  await db.execute(sql`
    DO $$ BEGIN
      IF to_regclass('bill_payments') IS NOT NULL THEN
        ALTER TABLE bill_payments DISABLE TRIGGER bill_payments_immutable;
        ALTER TABLE bills DISABLE TRIGGER bills_no_delete;
        DELETE FROM bill_payments WHERE bill_id IN
          (SELECT id FROM bills WHERE business_date = '2026-01-01'
             AND bill_number BETWEEN 9010 AND 9099);
        DELETE FROM bills WHERE business_date = '2026-01-01'
          AND bill_number BETWEEN 9010 AND 9099;
        ALTER TABLE bill_payments ENABLE TRIGGER bill_payments_immutable;
        ALTER TABLE bills ENABLE TRIGGER bills_no_delete;
      END IF;
    END $$
  `);

  // Expense categories cannot be deleted by trigger; lift it for the probe.
  await db.execute(sql`
    DO $$ BEGIN
      IF to_regclass('expense_categories') IS NOT NULL THEN
        ALTER TABLE expense_categories DISABLE TRIGGER expense_categories_no_delete;
        DELETE FROM expense_categories WHERE name ILIKE 'constraint probe cat';
        ALTER TABLE expense_categories ENABLE TRIGGER expense_categories_no_delete;
      END IF;
    END $$
  `);

  // Movement rows are immutable by trigger; lift it for the probe's rows only.
  // The table is absent on a database that predates stock tracking.
  await db.execute(sql`
    DO $$ BEGIN
      IF to_regclass('stock_movements') IS NOT NULL THEN
        ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_immutable;
        DELETE FROM stock_movements WHERE item_id IN
          (SELECT id FROM items WHERE name = 'Stock Constraint Probe');
        ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_immutable;
      END IF;
    END $$
  `);
  await db.execute(
    sql`DELETE FROM items WHERE name = 'Stock Constraint Probe'`,
  );
  await db.execute(
    sql`DELETE FROM categories WHERE name = 'Constraint Probe Category'`,
  );
  await db.execute(sql`DELETE FROM users WHERE username = 'constraint-probe'`);

  console.log(
    failures === 0
      ? "\nAll constraint checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

async function tableExists(name: string): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT to_regclass(${name}) IS NOT NULL AS present`,
  );
  return (result.rows[0] as { present: boolean }).present;
}

type ProbePaymentLine = {
  method: string;
  amount: string;
  tendered?: string;
  changeDue?: string;
};

/**
 * Split payment spec §6.3. The probe bills are dated 2026-01-01 and numbered
 * from 9010 up; the cleanup in main() removes them.
 */
async function verifyBillPaymentConstraints(userId: string) {
  /**
   * A bill and its payment lines in ONE statement. Each db.execute() is its
   * own transaction, so this is the only way the deferred balance check sees
   * the bill and its lines together when it runs at commit.
   */
  const billWithPayments = ({
    number,
    method,
    total,
    discount = "0.00",
    tendered = null,
    changeDue = null,
    lines,
  }: {
    number: number;
    method: string;
    total: string;
    discount?: string;
    tendered?: string | null;
    changeDue?: string | null;
    lines: ProbePaymentLine[];
  }): SQL => {
    const bill = sql`INSERT INTO bills (bill_number, business_date, subtotal,
        discount, total, payment_method, tendered, change_due,
        idempotency_key, created_by)
      VALUES (${number}, '2026-01-01', ${add(total, discount)}, ${discount},
        ${total}, ${method}, ${tendered}, ${changeDue}, gen_random_uuid(),
        ${userId}::uuid)
      RETURNING id`;
    if (lines.length === 0) return sql`WITH b AS (${bill}) SELECT id FROM b`;

    const rows = sql.join(
      lines.map(
        (line, index) =>
          sql`(${line.method}::payment_method, ${line.amount}::numeric,
            ${line.tendered ?? null}::numeric, ${line.changeDue ?? null}::numeric,
            ${index + 1}::smallint)`,
      ),
      sql`, `,
    );
    return sql`WITH b AS (${bill})
      INSERT INTO bill_payments (bill_id, method, amount, tendered, change_due,
        position)
      SELECT b.id, l.method, l.amount, l.tendered, l.change_due, l.position
      FROM b, (VALUES ${rows}) AS l(method, amount, tendered, change_due,
        position)`;
  };

  // Checked at commit by the deferred constraint triggers.
  await expectViolation(
    "a bill with no payment line is refused",
    billWithPayments({
      number: 9010,
      method: "CASH",
      total: "100.00",
      lines: [],
    }),
    "bill_payments_balance",
  );
  await expectViolation(
    "payment lines must add up to the bill total",
    billWithPayments({
      number: 9011,
      method: "CASH",
      total: "100.00",
      lines: [{ method: "CASH", amount: "90.00" }],
    }),
    "bill_payments_balance",
  );
  await expectViolation(
    "a split bill needs at least two lines",
    billWithPayments({
      number: 9012,
      method: "SPLIT",
      total: "100.00",
      lines: [{ method: "CASH", amount: "100.00" }],
    }),
    "bill_payments_balance",
  );
  await expectViolation(
    "every line of a split bill is more than ₹0",
    billWithPayments({
      number: 9013,
      method: "SPLIT",
      total: "100.00",
      lines: [
        { method: "CASH", amount: "100.00" },
        { method: "UPI", amount: "0.00" },
      ],
    }),
    "bill_payments_balance",
  );
  await expectViolation(
    "a one-method bill's line has the bill's method",
    billWithPayments({
      number: 9014,
      method: "UPI",
      total: "100.00",
      lines: [{ method: "CASH", amount: "100.00" }],
    }),
    "bill_payments_balance",
  );
  await expectViolation(
    "a cash bill's line carries the bill's cash given and change",
    billWithPayments({
      number: 9015,
      method: "CASH",
      total: "100.00",
      tendered: "200.00",
      changeDue: "100.00",
      lines: [{ method: "CASH", amount: "100.00" }],
    }),
    "bill_payments_balance",
  );

  // Checked on the row itself, so the bill a line names need not exist.
  await expectViolation(
    "a payment line is never SPLIT",
    sql`INSERT INTO bill_payments (bill_id, method, amount, position)
        VALUES (gen_random_uuid(), 'SPLIT', 100.00, 1)`,
    "bill_payments_not_split",
  );
  await expectViolation(
    "only a cash line carries cash given and change",
    sql`INSERT INTO bill_payments (bill_id, method, amount, tendered,
        change_due, position)
        VALUES (gen_random_uuid(), 'UPI', 100.00, 200.00, 100.00, 1)`,
    "bill_payments_tender_matches",
  );
  await expectViolation(
    "a split bill keeps cash given on its cash line, not on the bill",
    billWithPayments({
      number: 9016,
      method: "SPLIT",
      total: "500.00",
      tendered: "600.00",
      changeDue: "100.00",
      lines: [
        {
          method: "CASH",
          amount: "400.00",
          tendered: "500.00",
          changeDue: "100.00",
        },
        { method: "UPI", amount: "100.00" },
      ],
    }),
    "bills_split_has_no_tender",
  );
  await expectViolation(
    "SPLIT is never an enabled till method",
    sql`UPDATE shop_settings
        SET payment_methods = '{CASH,SPLIT}'::payment_method[]`,
    "shop_settings_no_split_method",
  );

  await expectAccepted(
    "a split bill whose lines add up",
    billWithPayments({
      number: 9017,
      method: "SPLIT",
      total: "500.00",
      lines: [
        {
          method: "CASH",
          amount: "400.00",
          tendered: "500.00",
          changeDue: "100.00",
        },
        { method: "UPI", amount: "100.00" },
      ],
    }),
  );
  // A 100% discount: the one place a ₹0.00 line is allowed.
  await expectAccepted(
    "a ₹0.00 cash bill with one ₹0.00 line",
    billWithPayments({
      number: 9018,
      method: "CASH",
      total: "0.00",
      discount: "10.00",
      lines: [{ method: "CASH", amount: "0.00" }],
    }),
  );
}

async function verifyExpenseConstraints(userId: string) {
  const expenseCategoryId = (
    (
      await db.execute(sql`
        INSERT INTO expense_categories (name) VALUES ('Constraint Probe Cat')
        RETURNING id
      `)
    ).rows[0] as { id: string }
  ).id;

  const insertExpense = (columns: SQL, values: SQL) =>
    sql`INSERT INTO expenses (expense_date, mode, category_id, idempotency_key,
        created_by, ${columns})
        VALUES ('2026-01-01', 'CASH', ${expenseCategoryId}::uuid,
        gen_random_uuid(), ${userId}::uuid, ${values})`;

  await expectViolation(
    "an expense of zero is refused",
    insertExpense(sql`amount`, sql`0.00`),
    "expenses_amount_positive",
  );
  await expectViolation(
    "a negative expense is refused",
    insertExpense(sql`amount`, sql`-1.00`),
    "expenses_amount_positive",
  );
  await expectViolation(
    "a cancellation must carry who and why",
    insertExpense(sql`amount, cancelled_at`, sql`10.00, now()`),
    "expenses_cancellation_complete",
  );
  await expectViolation(
    "paid to is at most 80 characters",
    insertExpense(sql`amount, paid_to`, sql`10.00, ${"x".repeat(81)}`),
    "expenses_paid_to_length",
  );
  await expectViolation(
    "two active expense categories cannot share a name",
    sql`INSERT INTO expense_categories (name) VALUES ('CONSTRAINT PROBE CAT')`,
    "expense_categories_name_lower_idx",
  );

  // Rows are never deleted, so the seeded nine survive renames and retirements.
  const categoryCount = (
    (
      await db.execute(
        sql`SELECT count(*)::int AS count FROM expense_categories`,
      )
    ).rows[0] as { count: number }
  ).count;
  if (categoryCount >= 9) {
    console.log(
      `PASS — the seeded expense categories exist (${categoryCount})`,
    );
  } else {
    failures += 1;
    console.error(
      `FAIL — expected at least 9 expense categories, found ${categoryCount}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
