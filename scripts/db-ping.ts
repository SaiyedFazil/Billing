import { sql } from "drizzle-orm";

import { db } from "../src/db";

async function main() {
  const started = Date.now();
  const result = await db.execute(sql`select now() as now, version() as version`);
  const row = result.rows[0] as { now: string; version: string };

  console.log("Connected in", Date.now() - started, "ms");
  console.log("Server time:", row.now);
  console.log("Version:", row.version.split(",")[0]);
  process.exit(0);
}

main().catch((error) => {
  console.error("Database connection FAILED:", error);
  process.exit(1);
});
