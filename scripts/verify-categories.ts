import { and, eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import { categories } from "../src/db/schema";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  // Soft delete must hide the row from the active partial unique index, so the
  // same name can be reused afterwards.
  await db.execute(sql`DELETE FROM categories WHERE name = 'Soft Delete Probe'`);

  const [created] = await db
    .insert(categories)
    .values({ name: "Soft Delete Probe", sortOrder: 99 })
    .returning({ id: categories.id });

  await db
    .update(categories)
    .set({ isActive: false })
    .where(eq(categories.id, created.id));

  const [reused] = await db
    .insert(categories)
    .values({ name: "Soft Delete Probe", sortOrder: 99 })
    .returning({ id: categories.id });

  check("a retired category's name can be reused", Boolean(reused?.id));

  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        sql`lower(${categories.name}) = 'soft delete probe'`,
        eq(categories.isActive, true),
      ),
    );
  check("only one ACTIVE row holds that name", rows.length === 1, rows);

  // Two ACTIVE categories must never share a name, case-insensitively.
  let duplicateRejected = false;
  try {
    await db
      .insert(categories)
      .values({ name: "SOFT DELETE PROBE", sortOrder: 1 });
  } catch {
    duplicateRejected = true;
  }
  check(
    "a case-different duplicate is rejected by the index",
    duplicateRejected,
  );

  await db.execute(sql`DELETE FROM categories WHERE name ILIKE 'soft delete probe'`);

  console.log(
    failures === 0
      ? "\nAll category checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
