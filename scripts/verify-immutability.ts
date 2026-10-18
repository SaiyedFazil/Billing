import { sql, type SQL } from "drizzle-orm";

import { db } from "../src/db";

let failures = 0;

/**
 * With `because`, the rejection must carry that text, so a statement that
 * fails for an unrelated reason (a missing table, a typo) is not a pass.
 */
async function expectRejection(
  label: string,
  statement: SQL,
  because?: string,
) {
  try {
    await db.execute(statement);
    failures += 1;
    console.error(`FAIL — ${label}: the database ACCEPTED the mutation`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = (error as { cause?: unknown }).cause;
    const full =
      cause instanceof Error ? `${message} ${cause.message}` : message;
    if (because && !full.includes(because)) {
      failures += 1;
      console.error(
        `FAIL — ${label}: rejected for the wrong reason:`,
        full.split("\n")[0],
      );
      return;
    }
    console.log(`PASS — ${label}: ${message.split("\n")[0]}`);
  }
}

async function main() {
  // --- build one real bill to attack ----------------------------------
  const setup = await db.execute(sql`
    WITH u AS (
      INSERT INTO users (username, password_hash, name, role)
      VALUES ('immutability-probe', 'x', 'Probe', 'ADMIN') RETURNING id
    ), c AS (
      INSERT INTO categories (name) VALUES ('Immutability Probe Category') RETURNING id
    ), i AS (
      INSERT INTO items (category_id, name, price)
      SELECT c.id, 'Immutability Probe Item', 50.00 FROM c RETURNING id
    ), b AS (
      INSERT INTO bills (bill_number, business_date, subtotal, discount,
                         total, payment_method, idempotency_key, created_by)
      SELECT 9100, '2026-01-02', 50.00, 0.00, 50.00, 'CASH', gen_random_uuid(), u.id
      FROM u RETURNING id
    )
    INSERT INTO bill_items (bill_id, item_id, item_name, category_name,
                            unit_price, quantity, line_total)
    SELECT b.id, i.id, 'Immutability Probe Item', 'Immutability Probe Category', 50.00, 1, 50.00
    FROM b, i
    RETURNING id, bill_id
  `);

  const { id: lineId, bill_id: billId } = setup.rows[0] as {
    id: string;
    bill_id: string;
  };

  // --- the four mutations that must be impossible ----------------------
  await expectRejection(
    "UPDATE on bill_items",
    sql`UPDATE bill_items SET quantity = 99 WHERE id = ${lineId}::uuid`,
  );
  await expectRejection(
    "DELETE on bill_items",
    sql`DELETE FROM bill_items WHERE id = ${lineId}::uuid`,
  );
  await expectRejection(
    "DELETE on bills",
    sql`DELETE FROM bills WHERE id = ${billId}::uuid`,
  );
  await expectRejection(
    "UPDATE of a non-void column on bills",
    sql`UPDATE bills SET total = 1.00 WHERE id = ${billId}::uuid`,
  );

  // --- stock history is append-only ------------------------------------
  const movement = await db.execute(sql`
    INSERT INTO stock_movements (item_id, type, quantity_delta, quantity_after, created_by)
    SELECT id, 'OPENING', 5, 5, (SELECT id FROM users WHERE username = 'immutability-probe')
    FROM items WHERE name = 'Immutability Probe Item'
    RETURNING id
  `);
  const { id: movementId } = movement.rows[0] as { id: string };

  await expectRejection(
    "UPDATE on stock_movements",
    sql`UPDATE stock_movements SET quantity_after = 99 WHERE id = ${movementId}::uuid`,
    "stock_movements are immutable",
  );
  await expectRejection(
    "DELETE on stock_movements",
    sql`DELETE FROM stock_movements WHERE id = ${movementId}::uuid`,
    "stock_movements are immutable",
  );

  // --- the one permitted mutation must SUCCEED -------------------------
  try {
    await db.execute(sql`
      UPDATE bills SET status = 'VOID', voided_at = now(), void_reason = 'probe'
      WHERE id = ${billId}::uuid
    `);
    console.log("PASS — voiding a bill is permitted");
  } catch (error) {
    failures += 1;
    console.error("FAIL — voiding a bill was rejected:", error);
  }

  // --- teardown --------------------------------------------------------
  // The triggers block our own cleanup, so disable them for the teardown only.
  await db.execute(
    sql`ALTER TABLE bill_items DISABLE TRIGGER bill_items_immutable`,
  );
  await db.execute(sql`ALTER TABLE bills DISABLE TRIGGER bills_no_delete`);
  await db.execute(sql`DELETE FROM bill_items WHERE bill_id = ${billId}::uuid`);
  await db.execute(sql`DELETE FROM bills WHERE id = ${billId}::uuid`);
  await db.execute(
    sql`ALTER TABLE bill_items ENABLE TRIGGER bill_items_immutable`,
  );
  await db.execute(sql`ALTER TABLE bills ENABLE TRIGGER bills_no_delete`);
  await db.execute(
    sql`ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_immutable`,
  );
  await db.execute(sql`
    DELETE FROM stock_movements WHERE item_id IN
      (SELECT id FROM items WHERE name = 'Immutability Probe Item')
  `);
  await db.execute(
    sql`ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_immutable`,
  );
  await db.execute(
    sql`DELETE FROM items WHERE name = 'Immutability Probe Item'`,
  );
  await db.execute(
    sql`DELETE FROM categories WHERE name = 'Immutability Probe Category'`,
  );
  await db.execute(
    sql`DELETE FROM users WHERE username = 'immutability-probe'`,
  );

  console.log(
    failures === 0
      ? "\nAll immutability checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
