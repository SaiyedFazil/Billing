import { writeFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { db } from "../src/db";

/**
 * Dumps every table to a single JSON file. A lightweight stand-in for pg_dump
 * when the Postgres client tools are not installed locally — enough to inspect
 * or hand-restore data, not a substitute for a real backup before a migration
 * on live data.
 *
 *   npx tsx --env-file=.env.local scripts/dump-json.ts <output-path>
 */
const TABLES = [
  "users",
  "categories",
  "items",
  "bills",
  "bill_items",
  "bill_payments",
  "bill_counters",
  "shop_settings",
] as const;

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("Usage: tsx scripts/dump-json.ts <output-path>");
    process.exit(1);
  }

  const dump: Record<string, unknown[]> = {};

  for (const table of TABLES) {
    const result = await db.execute(sql.raw(`SELECT * FROM ${table}`));
    dump[table] = result.rows;
    console.log(`${table}: ${result.rows.length} rows`);
  }

  writeFileSync(
    target,
    JSON.stringify(
      { dumpedAt: new Date().toISOString(), tables: dump },
      null,
      2,
    ),
  );
  console.log(`\nWritten to ${target}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
