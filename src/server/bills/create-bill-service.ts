import { eq, inArray, sql } from "drizzle-orm";

import {
  collectsTender,
  PAYMENT_METHOD_LABELS,
} from "@/constants/payment-methods";
import { db } from "@/db";
import {
  billCounters,
  billItems,
  billPayments,
  bills,
  categories,
  items,
} from "@/db/schema";
import { businessDate } from "@/lib/utils/dates";
import {
  billTotal,
  compare,
  formatINR,
  lineTotal,
  subtract,
  toAmount,
} from "@/lib/utils/money";
import { isUniqueViolation } from "@/lib/utils/parse-db-error";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import {
  getEnabledPaymentMethods,
  getShopTimezone,
} from "@/server/settings/settings-queries";
import {
  deductStockForBill,
  InsufficientStockError,
  quantityByItem,
} from "@/server/stock/stock-service";
import type { CreateBillInput, CreatedBill } from "@/types/bill.types";

const CREATED_BILL_COLUMNS = {
  id: bills.id,
  billNumber: bills.billNumber,
  businessDate: bills.businessDate,
  total: bills.total,
};

async function findByIdempotencyKey(key: string): Promise<CreatedBill | null> {
  const [existing] = await db
    .select(CREATED_BILL_COLUMNS)
    .from(bills)
    .where(eq(bills.idempotencyKey, key))
    .limit(1);
  return existing ?? null;
}

/**
 * A retry can pass the idempotency check while its original is still
 * committing, then find the stock that original just took. If the original
 * landed, the retry must return it — not report the bill as failed.
 */
async function outOfStock(
  idempotencyKey: string,
  message: string,
): Promise<ActionResult<CreatedBill>> {
  const saved = await findByIdempotencyKey(idempotencyKey);
  return saved ? ok(saved) : fail("OUT_OF_STOCK", message);
}

/**
 * Turns a cart into a persisted, immutable bill.
 *
 * The structure here is deliberate and load-bearing: EVERY failure path runs
 * before the transaction opens. Returning a value from inside db.transaction()
 * COMMITS it — only a thrown error rolls back — so a `return fail(...)` inside
 * the callback would leave the bill counter incremented with no bill against
 * it, burning a number and putting a gap in the sequence.
 *
 * See spec §8.2.
 */
export async function createBill(
  input: CreateBillInput,
  userId: string,
): Promise<ActionResult<CreatedBill>> {
  // ---- 1. Idempotency short-circuit ---------------------------------
  // A retry after a timeout must return the original bill, never a duplicate.
  const alreadySaved = await findByIdempotencyKey(input.idempotencyKey);
  if (alreadySaved) return ok(alreadySaved);

  // ---- 2. Validation phase ------------------------------------------
  const itemIds = [...new Set(input.lines.map((line) => line.itemId))];

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      price: items.price,
      isActive: items.isActive,
      isAvailable: items.isAvailable,
      trackStock: items.trackStock,
      stockQuantity: items.stockQuantity,
      categoryName: categories.name,
    })
    .from(items)
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .where(inArray(items.id, itemIds));

  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const line of input.lines) {
    const item = byId.get(line.itemId);
    if (!item) {
      return fail(
        "CONFLICT",
        "An item on this bill no longer exists. Remove it and try again.",
      );
    }
    if (!item.isActive) {
      return fail(
        "CONFLICT",
        `"${item.name}" has been removed from the menu. Remove it from the bill.`,
      );
    }
    if (!item.isAvailable) {
      return fail(
        "CONFLICT",
        `"${item.name}" is marked sold out. Remove it from the bill.`,
      );
    }
  }

  // Friendly messages for the common case. This read is not locked, so it
  // cannot stop two tills racing for the last unit — deductStockForBill()
  // does that inside the transaction. See the stock spec §7.2.
  for (const [itemId, quantity] of quantityByItem(input.lines)) {
    const item = byId.get(itemId)!;
    if (!item.trackStock || item.stockQuantity >= quantity) continue;
    return outOfStock(
      input.idempotencyKey,
      item.stockQuantity === 0
        ? `"${item.name}" is out of stock. Remove it from the bill.`
        : `Only ${item.stockQuantity} "${item.name}" left. Reduce the quantity.`,
    );
  }

  // Prices come from the database, never from the browser.
  const priced = input.lines.map((line) => {
    const item = byId.get(line.itemId)!;
    const unitPrice = toAmount(item.price);
    return {
      itemId: item.id,
      itemName: item.name,
      categoryName: item.categoryName,
      unitPrice,
      quantity: line.quantity,
      lineTotal: lineTotal(unitPrice, line.quantity),
    };
  });

  const { subtotal, discount, total } = billTotal(priced, input.discount);

  // billTotal clamps; a clamped value means the caller sent something invalid.
  if (compare(discount, input.discount) !== 0) {
    return fail(
      "VALIDATION",
      "The discount cannot be more than the subtotal.",
      {
        discount: "Must be between ₹0 and the subtotal",
      },
    );
  }

  if (compare(total, input.expectedTotal) !== 0) {
    return fail(
      "PRICE_CHANGED",
      `Prices changed while this bill was open. The new total is ${formatINR(total)}.`,
    );
  }

  // Both settings the rest of this function needs, in one round trip.
  const [timeZone, enabledMethods] = await Promise.all([
    getShopTimezone(),
    getEnabledPaymentMethods(),
  ]);

  // The till only draws buttons for enabled methods, but a server action is a
  // publicly callable endpoint — hiding a button is not enforcement, so the
  // method is checked here too. See spec §8.2.
  if (!enabledMethods.includes(input.paymentMethod)) {
    return fail(
      "CONFLICT",
      `${PAYMENT_METHOD_LABELS[input.paymentMethod]} is no longer accepted at this shop. Pick another payment method.`,
    );
  }

  let tendered: string | null = null;
  let changeDue: string | null = null;

  if (collectsTender(input.paymentMethod) && input.tendered !== null) {
    tendered = toAmount(input.tendered);
    if (compare(tendered, total) < 0) {
      return fail(
        "VALIDATION",
        "The amount tendered is less than the bill total.",
        { tendered: `Must be at least ${formatINR(total)}` },
      );
    }
    changeDue = subtract(tendered, total);
  }

  // Stamped as late as possible, so the date reflects when the bill was saved.
  const date = businessDate(new Date(), timeZone);

  // ---- 3. Write phase -----------------------------------------------
  // One transaction. Only throws from here on.
  try {
    const created = await db.transaction(async (tx) => {
      // Reserve the day's next number. The ON CONFLICT takes a row lock, so
      // concurrent tills serialize here. Rolling back rolls this back too,
      // which is what makes the sequence gapless. See spec §6.7.
      const [counter] = await tx
        .insert(billCounters)
        .values({ businessDate: date, lastNumber: 1 })
        .onConflictDoUpdate({
          target: billCounters.businessDate,
          set: { lastNumber: sql`${billCounters.lastNumber} + 1` },
        })
        .returning({ lastNumber: billCounters.lastNumber });

      const [bill] = await tx
        .insert(bills)
        .values({
          billNumber: counter.lastNumber,
          businessDate: date,
          subtotal,
          discount,
          total,
          paymentMethod: input.paymentMethod,
          tendered,
          changeDue,
          idempotencyKey: input.idempotencyKey,
          createdBy: userId,
        })
        .returning(CREATED_BILL_COLUMNS);

      // How the bill was paid. A deferred trigger checks at COMMIT that the
      // lines add up to the bill, so a mismatch throws out of the transaction.
      await tx.insert(billPayments).values({
        billId: bill.id,
        method: input.paymentMethod,
        amount: total,
        tendered,
        changeDue,
        position: 1,
      });

      await tx.insert(billItems).values(
        priced.map((line) => ({
          billId: bill.id,
          itemId: line.itemId,
          itemName: line.itemName,
          categoryName: line.categoryName,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
      );

      // Last write: a shortage throws, rolling back the bill and its number.
      await deductStockForBill(tx, {
        billId: bill.id,
        userId,
        lines: input.lines,
      });

      return bill;
    });

    return ok(created);
  } catch (error) {
    // Another till took the last of an item after validation passed.
    if (error instanceof InsufficientStockError) {
      return outOfStock(
        input.idempotencyKey,
        `"${error.itemName}" just sold out. Remove it from the bill.`,
      );
    }
    // Two requests raced with the same key. The other one won; return its bill.
    if (isUniqueViolation(error, "bills_idempotency_key_idx")) {
      const raced = await findByIdempotencyKey(input.idempotencyKey);
      if (raced) return ok(raced);
    }
    throw error;
  }
}
