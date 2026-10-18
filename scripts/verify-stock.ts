import { and, count, eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import {
  billCounters,
  bills,
  categories,
  items,
  stockMovements,
} from "../src/db/schema";
import { businessDate } from "../src/lib/utils/dates";
import { createBill } from "../src/server/bills/create-bill-service";
import { getShopTimezone } from "../src/server/settings/settings-queries";
import { deductStockForBill } from "../src/server/stock/stock-service";

/**
 * Stock against a real database. Works on its own probe category and items so
 * the seeded menu is never touched.
 *
 * Probe bills are kept, like verify:bill's: deleting a bill would put a gap in
 * the day's numbering. So the probe items are retired at the end (never
 * deleted, per CLAUDE.md rule 5), and each run starts from fresh ones.
 */

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

const PROBE_CATEGORY = "Stock Probe Category";
const TRACKED = "Stock Probe Tracked";
const UNTRACKED = "Stock Probe Untracked";

async function retireProbes() {
  await db
    .update(items)
    .set({ isActive: false })
    .where(sql`${items.name} IN (${TRACKED}, ${UNTRACKED})`);
  await db
    .update(categories)
    .set({ isActive: false })
    .where(eq(categories.name, PROBE_CATEGORY));
}

async function stockOf(itemId: string): Promise<number> {
  const [row] = await db
    .select({ stockQuantity: items.stockQuantity })
    .from(items)
    .where(eq(items.id, itemId));
  return row.stockQuantity;
}

async function movementsOf(itemId: string) {
  return db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.itemId, itemId))
    .orderBy(stockMovements.createdAt);
}

async function setStock(itemId: string, stockQuantity: number) {
  // Test setup only. The app changes stock solely through stock-service.ts.
  await db.update(items).set({ stockQuantity }).where(eq(items.id, itemId));
}

async function main() {
  const userRow = await db.execute(
    sql`SELECT id FROM users WHERE role = 'SUPERADMIN' AND is_active LIMIT 1`,
  );
  const userId = (userRow.rows[0] as { id: string } | undefined)?.id;
  if (!userId) throw new Error("No superadmin. Run `npm run db:seed` first.");

  await retireProbes();

  const [category] = await db
    .insert(categories)
    .values({ name: PROBE_CATEGORY })
    .returning({ id: categories.id });
  const [tracked] = await db
    .insert(items)
    .values({
      categoryId: category.id,
      name: TRACKED,
      price: "10.00",
      trackStock: true,
      stockQuantity: 5,
    })
    .returning({ id: items.id });
  const [untracked] = await db
    .insert(items)
    .values({ categoryId: category.id, name: UNTRACKED, price: "10.00" })
    .returning({ id: items.id });

  const today = businessDate(new Date(), await getShopTimezone());

  async function counter(): Promise<number> {
    const [row] = await db
      .select({ lastNumber: billCounters.lastNumber })
      .from(billCounters)
      .where(eq(billCounters.businessDate, today));
    return row?.lastNumber ?? 0;
  }

  async function billCount(): Promise<number> {
    const [row] = await db.select({ n: count() }).from(bills);
    return row.n;
  }

  function sell(
    lines: Array<{ itemId: string; quantity: number }>,
    idempotencyKey: string = crypto.randomUUID(),
  ) {
    const total = lines.reduce((sum, line) => sum + line.quantity * 10, 0);
    return createBill(
      {
        idempotencyKey,
        lines,
        discount: "0.00",
        paymentMethod: "CASH",
        tendered: null,
        expectedTotal: `${total}.00`,
      },
      userId!,
    );
  }

  try {
    // --- a sale deducts --------------------------------------------------
    const sale = await sell([{ itemId: tracked.id, quantity: 2 }]);
    const afterSale = await movementsOf(tracked.id);
    check(
      "a sale deducts and writes a SALE movement",
      sale.ok &&
        (await stockOf(tracked.id)) === 3 &&
        afterSale.length === 1 &&
        afterSale[0].type === "SALE" &&
        afterSale[0].quantityDelta === -2 &&
        afterSale[0].quantityAfter === 3 &&
        afterSale[0].billId === sale.data.id,
      { sale, afterSale },
    );

    // --- untracked items are untouched ----------------------------------
    const plain = await sell([{ itemId: untracked.id, quantity: 4 }]);
    check(
      "an untracked item's bill is unaffected",
      plain.ok &&
        (await movementsOf(untracked.id)).length === 0 &&
        (await stockOf(untracked.id)) === 0,
      plain,
    );

    // --- overselling is refused before anything is written --------------
    const billsBefore = await billCount();
    const counterBefore = await counter();
    const over = await sell([{ itemId: tracked.id, quantity: 4 }]);
    check(
      "selling more than in stock fails with OUT_OF_STOCK",
      !over.ok &&
        over.error.code === "OUT_OF_STOCK" &&
        over.error.message === `Only 3 "${TRACKED}" left. Reduce the quantity.`,
      over,
    );
    check(
      "a refused bill writes no bill, number or movement",
      (await billCount()) === billsBefore &&
        (await counter()) === counterBefore &&
        (await movementsOf(tracked.id)).length === 1,
    );

    const split = await sell([
      { itemId: tracked.id, quantity: 2 },
      { itemId: tracked.id, quantity: 2 },
    ]);
    check(
      "the same item on two lines is summed",
      !split.ok && split.error.code === "OUT_OF_STOCK",
      split,
    );

    // --- two tills, one unit -------------------------------------------
    await setStock(tracked.id, 1);
    const raceCounter = await counter();
    const results = await Promise.all([
      sell([{ itemId: tracked.id, quantity: 1 }]),
      sell([{ itemId: tracked.id, quantity: 1 }]),
    ]);
    const winners = results.filter((result) => result.ok);
    const losers = results.filter(
      (result) => !result.ok && result.error.code === "OUT_OF_STOCK",
    );
    check(
      "two concurrent bills for the last unit: exactly one succeeds",
      winners.length === 1 &&
        losers.length === 1 &&
        (await stockOf(tracked.id)) === 0,
      results,
    );
    check(
      "the losing till burns no bill number",
      (await counter()) === raceCounter + 1,
      { before: raceCounter, after: await counter() },
    );

    // --- retries ---------------------------------------------------------
    await setStock(tracked.id, 4);
    const key = crypto.randomUUID();
    const first = await sell([{ itemId: tracked.id, quantity: 1 }], key);
    const retry = await sell([{ itemId: tracked.id, quantity: 1 }], key);
    const saleRows = (await movementsOf(tracked.id)).filter(
      (row) => first.ok && row.billId === first.data.id,
    );
    check(
      "an idempotent retry does not deduct twice",
      first.ok &&
        retry.ok &&
        retry.data.id === first.data.id &&
        saleRows.length === 1 &&
        (await stockOf(tracked.id)) === 3,
      { first, retry, saleRows },
    );

    // --- tracking switched off between validation and the write ---------
    const sentinel = new Error("roll back the probe transaction");
    let threw: unknown = null;
    let saleRowsInside = -1;
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(items)
          .set({ trackStock: false })
          .where(eq(items.id, tracked.id));
        await deductStockForBill(tx, {
          billId: crypto.randomUUID(),
          userId: userId!,
          lines: [{ itemId: tracked.id, quantity: 99 }],
        });
        const rows = await tx
          .select({ n: count() })
          .from(stockMovements)
          .where(
            and(
              eq(stockMovements.itemId, tracked.id),
              eq(stockMovements.type, "SALE"),
            ),
          );
        saleRowsInside = rows[0].n;
        throw sentinel;
      });
    } catch (error) {
      threw = error;
    }
    check(
      "tracking switched off mid-flight sells without deducting",
      threw === sentinel && saleRowsInside === 3,
      { threw, saleRowsInside },
    );

    // --- zero ------------------------------------------------------------
    await setStock(tracked.id, 0);
    const none = await sell([{ itemId: tracked.id, quantity: 1 }]);
    check(
      "a tracked item at zero cannot be billed",
      !none.ok &&
        none.error.code === "OUT_OF_STOCK" &&
        none.error.message ===
          `"${TRACKED}" is out of stock. Remove it from the bill.`,
      none,
    );
  } finally {
    await retireProbes();
  }

  console.log(
    failures === 0 ? "\nAll stock checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
