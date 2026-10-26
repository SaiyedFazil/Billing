import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import { categories, items } from "../src/db/schema";
import { compare } from "../src/lib/utils/money";
import { renumberCategory } from "../src/server/items/item-order-service";

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

  await db.execute(sql`DELETE FROM items WHERE name = 'Price Probe Item'`);

  const [created] = await db
    .insert(items)
    .values({
      categoryId: category.id,
      name: "Price Probe Item",
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

  // Soft delete must free the name within the category.
  await db
    .update(items)
    .set({ isActive: false })
    .where(eq(items.id, created.id));
  const [reused] = await db
    .insert(items)
    .values({
      categoryId: category.id,
      name: "Price Probe Item",
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

  // --- display order ------------------------------------------------------
  await db.execute(sql`DELETE FROM items WHERE name LIKE 'Order Probe%'`);
  await db.execute(
    sql`DELETE FROM categories WHERE name = 'Order Probe Category'`,
  );

  const [orderCategory] = await db
    .insert(categories)
    .values({ name: "Order Probe Category", sortOrder: 900 })
    .returning({ id: categories.id });

  const probeIds: Record<string, string> = {};
  for (const [index, label] of ["A", "B", "C", "D"].entries()) {
    const [row] = await db
      .insert(items)
      .values({
        categoryId: orderCategory.id,
        name: `Order Probe ${label}`,
        price: "10.00",
        sortOrder: index === 3 ? 20 : index,
      })
      .returning({ id: items.id });
    probeIds[label] = row.id;
  }

  async function currentOrder(categoryId = orderCategory.id) {
    const rows = await db
      .select({ name: items.name, sortOrder: items.sortOrder })
      .from(items)
      .where(and(eq(items.categoryId, categoryId), eq(items.isActive, true)))
      .orderBy(asc(items.sortOrder), asc(items.name));
    return rows.map((row) => `${row.name.slice(-1)}${row.sortOrder}`).join(" ");
  }

  check("probe starts A0 B1 C2 D20", (await currentOrder()) === "A0 B1 C2 D20");

  // The case from the report: send the far item to position 1.
  await db.transaction((tx) =>
    renumberCategory(tx, orderCategory.id, { itemId: probeIds.D, position: 1 }),
  );
  check(
    "moving D to 1 pushes B and C down and closes the gap",
    (await currentOrder()) === "A0 D1 B2 C3",
    await currentOrder(),
  );

  // Moving DOWN must pull the items in between up, not push them further.
  await db.transaction((tx) =>
    renumberCategory(tx, orderCategory.id, { itemId: probeIds.A, position: 2 }),
  );
  check(
    "moving A down to 2 pulls D and B up",
    (await currentOrder()) === "D0 B1 A2 C3",
    await currentOrder(),
  );

  // A number past the end means "last", not a gap.
  const clamped = await db.transaction((tx) =>
    renumberCategory(tx, orderCategory.id, {
      itemId: probeIds.D,
      position: 9999,
    }),
  );
  check(
    "an out-of-range position lands last, still contiguous",
    (await currentOrder()) === "B0 A1 C2 D3" && clamped === 3,
    { order: await currentOrder(), clamped },
  );

  // Retiring an item must not leave a hole behind.
  await db
    .update(items)
    .set({ isActive: false })
    .where(eq(items.id, probeIds.A));
  await db.transaction((tx) => renumberCategory(tx, orderCategory.id));
  check(
    "retiring an item closes its gap",
    (await currentOrder()) === "B0 C1 D2",
    await currentOrder(),
  );

  await db.execute(sql`DELETE FROM items WHERE name LIKE 'Order Probe%'`);
  await db.execute(
    sql`DELETE FROM categories WHERE name = 'Order Probe Category'`,
  );

  await db.execute(
    sql`DELETE FROM items WHERE name IN ('Price Probe Item', 'Negative Probe')`,
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
