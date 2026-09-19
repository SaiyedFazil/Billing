import { sql } from "drizzle-orm";

import { db } from "../src/db";

/**
 * Ad-hoc inspection of the current database state. Not a verification script —
 * it asserts nothing, it just prints what is there.
 */
async function main() {
  console.log("--- users ---");
  console.table(
    (
      await db.execute(
        sql`SELECT username, role, is_active, failed_attempts, locked_until FROM users ORDER BY username`,
      )
    ).rows,
  );

  console.log("--- shop settings ---");
  console.table(
    (
      await db.execute(
        sql`SELECT shop_name, phone, printer_width, timezone FROM shop_settings`,
      )
    ).rows,
  );

  console.log("--- menu ---");
  console.table(
    (
      await db.execute(sql`
        SELECT c.name AS category, i.name AS item, i.price, i.is_available
        FROM items i JOIN categories c ON c.id = i.category_id
        WHERE i.is_active ORDER BY c.sort_order, i.sort_order`)
    ).rows,
  );

  console.log("--- bills ---");
  console.table(
    (
      await db.execute(sql`
        SELECT b.business_date, b.bill_number, b.subtotal, b.discount,
               b.total, b.payment_method, b.status, u.name AS cashier,
               (SELECT count(*)::int FROM bill_items bi WHERE bi.bill_id = b.id) AS lines
        FROM bills b JOIN users u ON u.id = b.created_by
        ORDER BY b.business_date, b.bill_number`)
    ).rows,
  );

  console.log("--- bill counters ---");
  console.table((await db.execute(sql`SELECT * FROM bill_counters`)).rows);

  console.log("--- recent audit log ---");
  console.table(
    (
      await db.execute(
        sql`SELECT action, entity_type, created_at FROM audit_log ORDER BY created_at DESC LIMIT 10`,
      )
    ).rows,
  );

  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
