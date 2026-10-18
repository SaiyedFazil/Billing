import { sql } from "drizzle-orm";

import { db } from "../src/db";

/**
 * Deletes ALL bills, bill lines, counters and stock history, and switches
 * stock tracking off on every item. For the development-to-handover
 * transition only — the shop's real ledger must never be run through this.
 *
 * The immutability triggers exist precisely to stop this happening by accident,
 * so they are disabled and re-enabled around the delete.
 */
async function main() {
  if (process.argv[2] !== "--yes-delete-all-bills") {
    console.error(
      "Refusing to run without an explicit flag.\n\n" +
        "  npm run db:reset-bills -- --yes-delete-all-bills\n\n" +
        "This permanently deletes every bill. Never run it against a shop's\n" +
        "real data. Take a backup first (npm run db:dump <path>).",
    );
    process.exit(1);
  }

  const before = await db.execute(
    sql`SELECT (SELECT count(*)::int FROM bills) AS bills,
               (SELECT count(*)::int FROM bill_items) AS lines`,
  );
  console.table(before.rows);

  await db.execute(
    sql`ALTER TABLE bill_items DISABLE TRIGGER bill_items_immutable`,
  );
  await db.execute(sql`ALTER TABLE bills DISABLE TRIGGER bills_no_delete`);
  await db.execute(
    sql`ALTER TABLE bills DISABLE TRIGGER bills_restrict_update`,
  );

  await db.execute(
    sql`ALTER TABLE stock_movements DISABLE TRIGGER stock_movements_immutable`,
  );

  // Stock history goes too: SALE rows point at the bills being deleted, and
  // keeping only the restocks would leave counts no history explains. Every
  // item starts untracked again, exactly as on a fresh install.
  await db.execute(sql`DELETE FROM stock_movements`);
  await db.execute(
    sql`UPDATE items SET track_stock = false, stock_quantity = 0`,
  );
  await db.execute(sql`DELETE FROM bill_items`);
  await db.execute(sql`DELETE FROM bills`);
  await db.execute(sql`DELETE FROM bill_counters`);

  await db.execute(
    sql`ALTER TABLE bill_items ENABLE TRIGGER bill_items_immutable`,
  );
  await db.execute(sql`ALTER TABLE bills ENABLE TRIGGER bills_no_delete`);
  await db.execute(sql`ALTER TABLE bills ENABLE TRIGGER bills_restrict_update`);
  await db.execute(
    sql`ALTER TABLE stock_movements ENABLE TRIGGER stock_movements_immutable`,
  );

  // Confirm every trigger came back on. Leaving one disabled would silently
  // remove the audit guarantee, and nothing else would ever notice.
  const check = await db.execute(sql`
    SELECT tgname, tgenabled FROM pg_trigger
    WHERE tgname IN ('bill_items_immutable', 'bills_no_delete',
                     'bills_restrict_update', 'stock_movements_immutable')
    ORDER BY tgname`);

  const triggers = check.rows as Array<{ tgname: string; tgenabled: string }>;
  console.table(triggers);

  // 'O' means "enabled, origin" — the normal enabled state. 'D' is disabled.
  const allEnabled =
    triggers.length === 4 && triggers.every((t) => t.tgenabled === "O");

  console.log(
    allEnabled
      ? "Bills cleared. All four immutability triggers are ENABLED."
      : "WARNING — a trigger is still disabled. Re-run `npm run db:migrate`.",
  );

  process.exit(allEnabled ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
