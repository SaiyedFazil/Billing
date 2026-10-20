import { sql, type SQL } from "drizzle-orm";

import { db } from "../src/db";

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
