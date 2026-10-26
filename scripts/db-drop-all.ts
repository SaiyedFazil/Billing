import { sql } from "drizzle-orm";

import { db } from "../src/db";

/**
 * Drops every object this application owns, so the migrations can be applied
 * to a genuinely clean database.
 *
 * Development only. Refuses to run without an explicit flag.
 */
async function main() {
  if (process.argv[2] !== "--yes-drop-everything") {
    console.error(
      "Refusing to run without an explicit flag:\n" +
        "  npx tsx --env-file=.env.local scripts/db-drop-all.ts --yes-drop-everything",
    );
    process.exit(1);
  }

  const before = await db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
  );
  console.log(
    "before:",
    before.rows
      .map((row) => (row as { tablename: string }).tablename)
      .join(", ") || "(no tables)",
  );

  // Order matters only without CASCADE; with it, one statement each is enough.
  await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS __migrations CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS stock_movements CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS expenses CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS expense_categories CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS bill_items CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS bill_payments CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS bills CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS bill_counters CASCADE`);
  // Migration 0011 drops audit_log. A database that has not run 0011 yet
  // still has it, and re-running 0000 after this script would collide with it.
  await db.execute(sql`DROP TABLE IF EXISTS audit_log CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS items CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS categories CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS shop_settings CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS users CASCADE`);

  await db.execute(
    sql`DROP FUNCTION IF EXISTS prevent_bill_item_mutation CASCADE`,
  );
  await db.execute(sql`DROP FUNCTION IF EXISTS prevent_bill_delete CASCADE`);
  await db.execute(sql`DROP FUNCTION IF EXISTS restrict_bill_update CASCADE`);
  await db.execute(
    sql`DROP FUNCTION IF EXISTS prevent_stock_movement_mutation CASCADE`,
  );
  await db.execute(sql`DROP FUNCTION IF EXISTS prevent_expense_delete CASCADE`);
  await db.execute(
    sql`DROP FUNCTION IF EXISTS restrict_cancelled_expense_update CASCADE`,
  );
  await db.execute(
    sql`DROP FUNCTION IF EXISTS prevent_expense_category_delete CASCADE`,
  );
  await db.execute(
    sql`DROP FUNCTION IF EXISTS prevent_bill_payment_mutation CASCADE`,
  );
  await db.execute(
    sql`DROP FUNCTION IF EXISTS check_bill_payments_on_bill CASCADE`,
  );
  await db.execute(
    sql`DROP FUNCTION IF EXISTS check_bill_payments_on_line CASCADE`,
  );
  await db.execute(
    sql`DROP FUNCTION IF EXISTS assert_bill_payments_balance CASCADE`,
  );

  await db.execute(sql`DROP TYPE IF EXISTS user_role CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS payment_method CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS bill_status CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS printer_width CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS stock_movement_type CASCADE`);
  await db.execute(sql`DROP TYPE IF EXISTS expense_mode CASCADE`);

  const after = await db.execute(
    sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`,
  );
  const enums = await db.execute(
    sql`SELECT typname FROM pg_type
        WHERE typnamespace = 'public'::regnamespace AND typtype = 'e' ORDER BY 1`,
  );

  console.log(
    "after tables:",
    after.rows
      .map((row) => (row as { tablename: string }).tablename)
      .join(", ") || "(none)",
  );
  console.log(
    "after enums:",
    enums.rows.map((row) => (row as { typname: string }).typname).join(", ") ||
      "(none)",
  );

  process.exit(after.rows.length === 0 && enums.rows.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
