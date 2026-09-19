import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { sql } from "drizzle-orm";

import { db } from "../src/db";

/**
 * Applies the SQL migrations in order.
 *
 * Used instead of `drizzle-kit migrate` because drizzle-kit swallows the
 * Postgres error detail when a statement fails, which makes a broken migration
 * very hard to diagnose. This prints the failing statement verbatim.
 */
const MIGRATIONS_DIR = join(process.cwd(), "src/db/migrations");

async function main() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS __migrations (
      tag text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await db.execute(sql`SELECT tag FROM __migrations`)).rows.map(
      (row) => (row as { tag: string }).tag,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const tag = file.replace(/\.sql$/, "");
    if (applied.has(tag)) {
      console.log(`skip  ${tag} (already applied)`);
      continue;
    }

    const contents = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const statements = contents
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter((statement) => statement.length > 0);

    console.log(`apply ${tag} (${statements.length} statements)`);

    for (const [index, statement] of statements.entries()) {
      try {
        await db.execute(sql.raw(statement));
      } catch (error) {
        console.error(`\nFAILED in ${tag}, statement ${index + 1}:\n`);
        console.error(statement);
        console.error("\nPostgres said:");
        // Drizzle wraps the driver error; the useful detail is on the cause.
        const cause = (error as { cause?: unknown }).cause;
        console.error(error instanceof Error ? error.message : error);
        if (cause) console.error("cause:", cause);
        process.exit(1);
      }
    }

    await db.execute(sql`INSERT INTO __migrations (tag) VALUES (${tag})`);
  }

  console.log("\nAll migrations applied.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
