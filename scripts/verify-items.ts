import { desc, eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import { auditLog, categories, items } from "../src/db/schema";
import { compare } from "../src/lib/utils/money";

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
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isActive, true))
    .limit(1);

  await db.execute(sql`DELETE FROM audit_log WHERE entity_type = 'item-probe'`);
  await db.execute(sql`DELETE FROM items WHERE name = 'Audit Probe Item'`);

  const [created] = await db
    .insert(items)
    .values({
      categoryId: category.id,
      name: "Audit Probe Item",
      price: "50.00",
    })
    .returning({ id: items.id });

  // Prices must survive the round trip exactly, including awkward decimals.
  await db
    .update(items)
    .set({ price: "75.55" })
    .where(eq(items.id, created.id));

  const stored = await db.query.items.findFirst({
    where: eq(items.id, created.id),
  });
  check(
    "an awkward decimal price round-trips exactly",
    compare(stored!.price, "75.55") === 0,
    stored?.price,
  );

  // Simulate what updateItemAction writes on a price change.
  await db.insert(auditLog).values({
    action: "ITEM_PRICE_CHANGED",
    entityType: "item-probe",
    entityId: created.id,
    before: { price: "50.00" },
    after: { price: "75.55" },
  });

  const [logged] = await db
    .select({ before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(eq(auditLog.entityId, created.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  check(
    "price history is queryable from the audit log",
    (logged?.before as { price: string })?.price === "50.00" &&
      (logged?.after as { price: string })?.price === "75.55",
    logged,
  );

  // Soft delete must free the name within the category.
  await db
    .update(items)
    .set({ isActive: false })
    .where(eq(items.id, created.id));
  const [reused] = await db
    .insert(items)
    .values({
      categoryId: category.id,
      name: "Audit Probe Item",
      price: "1.00",
    })
    .returning({ id: items.id });
  check("a retired item's name can be reused", Boolean(reused?.id));

  // A negative price must be impossible.
  let negativeRejected = false;
  try {
    await db.insert(items).values({
      categoryId: category.id,
      name: "Negative Probe",
      price: "-1.00",
    });
  } catch {
    negativeRejected = true;
  }
  check("a negative price is rejected", negativeRejected);

  await db.execute(sql`DELETE FROM audit_log WHERE entity_type = 'item-probe'`);
  await db.execute(
    sql`DELETE FROM items WHERE name IN ('Audit Probe Item', 'Negative Probe')`,
  );

  console.log(
    failures === 0 ? "\nAll item checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
