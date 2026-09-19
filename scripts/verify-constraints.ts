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
    (await db.execute(sql`SELECT id FROM users WHERE username = 'constraint-probe'`))
      .rows[0] as { id: string }
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

  // --- cleanup --------------------------------------------------------
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
