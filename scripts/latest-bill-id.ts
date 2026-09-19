import { sql } from "drizzle-orm";

import { db } from "../src/db";

/** Prints the id of the most recent bill. Used for manual print-route checks. */
async function main() {
  const result = await db.execute(
    sql`SELECT id FROM bills ORDER BY created_at DESC LIMIT 1`,
  );
  const row = result.rows[0] as { id: string } | undefined;
  if (!row) {
    console.error("No bills yet.");
    process.exit(1);
  }
  process.stdout.write(row.id);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
