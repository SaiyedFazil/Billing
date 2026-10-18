import { asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { items, stockMovements } from "@/db/schema";
import type { Transaction } from "@/db/transaction";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { planAdjustment } from "@/lib/utils/stock";
import type { AdjustStockInput } from "@/lib/validation/stock-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";

/**
 * Every change to a stock count goes through this file, and always writes a
 * stock_movements row in the same transaction. See the stock spec §6.2.
 */

/** Thrown when a sale lands between the pre-check and the locked write. */
class StockChangedError extends Error {
  constructor(readonly current: number) {
    super(`Stock changed to ${current} during an adjustment`);
    this.name = "StockChangedError";
  }
}

/** Thrown inside a transaction to roll it back; never reaches the browser. */
export class InsufficientStockError extends Error {
  constructor(
    readonly itemName: string,
    readonly available: number,
  ) {
    super(`Insufficient stock for ${itemName}: ${available} left`);
    this.name = "InsufficientStockError";
  }
}

/** Requested quantity per item, with repeated lines added together. */
export function quantityByItem(
  lines: Array<{ itemId: string; quantity: number }>,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const line of lines) {
    totals.set(line.itemId, (totals.get(line.itemId) ?? 0) + line.quantity);
  }
  return totals;
}

/**
 * Takes a bill's quantities out of stock, inside the bill's own transaction.
 *
 * The rows are locked first, in id order, so two tills selling the same items
 * queue rather than deadlock, and each sees the count the other left. The
 * check runs on that locked value, which is what stops the last unit being
 * sold twice. Only throws — see CLAUDE.md rule 6.
 *
 * An item whose tracking was switched off after the bill was validated is
 * simply sold, without a deduction.
 */
export async function deductStockForBill(
  tx: Transaction,
  args: {
    billId: string;
    userId: string;
    lines: Array<{ itemId: string; quantity: number }>;
  },
): Promise<void> {
  const wanted = quantityByItem(args.lines);

  const locked = await tx
    .select({
      id: items.id,
      name: items.name,
      trackStock: items.trackStock,
      stockQuantity: items.stockQuantity,
    })
    .from(items)
    .where(inArray(items.id, [...wanted.keys()]))
    .orderBy(asc(items.id))
    .for("update");

  for (const item of locked) {
    if (!item.trackStock) continue;

    const quantity = wanted.get(item.id)!;
    if (item.stockQuantity < quantity) {
      throw new InsufficientStockError(item.name, item.stockQuantity);
    }

    const after = item.stockQuantity - quantity;
    await tx
      .update(items)
      .set({ stockQuantity: after, updatedAt: new Date() })
      .where(eq(items.id, item.id));
    await tx.insert(stockMovements).values({
      itemId: item.id,
      type: "SALE",
      quantityDelta: -quantity,
      quantityAfter: after,
      billId: args.billId,
      createdBy: args.userId,
    });
  }
}

/**
 * The owner's Update stock dialog: add, remove or set an exact count.
 *
 * Checked twice: once before the transaction for a clear field error, and
 * again on the locked row, because a sale can land while the dialog is open.
 * Add and Remove are relative, so they stay right across that sale; Set is
 * absolute by design — it records a physical count.
 */
export async function adjustStock(
  input: AdjustStockInput,
  userId: string,
): Promise<ActionResult<{ before: number; after: number }>> {
  const item = await db.query.items.findFirst({
    where: eq(items.id, input.itemId),
  });
  if (!item || !item.isActive) {
    return fail("NOT_FOUND", "That item no longer exists.");
  }
  if (!item.trackStock) {
    return fail("CONFLICT", "Turn on stock tracking for this item first.");
  }

  const plan = planAdjustment(item.stockQuantity, input.mode, input.quantity);
  if (!plan.ok) {
    return fail("VALIDATION", plan.message, { quantity: plan.message });
  }

  let result: { before: number; after: number };
  try {
    result = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select({
          stockQuantity: items.stockQuantity,
          trackStock: items.trackStock,
        })
        .from(items)
        .where(eq(items.id, input.itemId))
        .for("update");

      const replanned = planAdjustment(
        locked.stockQuantity,
        input.mode,
        input.quantity,
      );
      if (!locked.trackStock || !replanned.ok) {
        throw new StockChangedError(locked.stockQuantity);
      }

      await tx
        .update(items)
        .set({ stockQuantity: replanned.after, updatedAt: new Date() })
        .where(eq(items.id, input.itemId));
      await tx.insert(stockMovements).values({
        itemId: input.itemId,
        type: input.reason,
        quantityDelta: replanned.delta,
        quantityAfter: replanned.after,
        note: input.note || null,
        createdBy: userId,
      });

      return { before: locked.stockQuantity, after: replanned.after };
    });
  } catch (error) {
    if (error instanceof StockChangedError) {
      return fail(
        "CONFLICT",
        `Stock changed while you were editing. ${error.current} are left now.`,
      );
    }
    throw error;
  }

  await writeAuditLog({
    actorId: userId,
    action: "STOCK_ADJUSTED",
    entityType: "item",
    entityId: input.itemId,
    before: { stockQuantity: result.before },
    after: {
      stockQuantity: result.after,
      mode: input.mode,
      reason: input.reason,
      note: input.note || null,
    },
  });

  return ok(result);
}

/**
 * Called inside the item create/update transaction, after the row is written.
 *
 * Only switching tracking ON changes the count: it records the opening count
 * the owner entered, so an item never jumps straight to "Out of stock". The
 * delta is measured against the count kept from an earlier tracked spell
 * (often 0); the history shows the row as "Opening count", not as a jump.
 * Every other transition leaves the count and the history alone.
 */
export async function applyTrackingChange(
  tx: Transaction,
  args: {
    itemId: string;
    userId: string;
    wasTracked: boolean;
    storedQuantity: number;
    trackStock: boolean;
    openingStock: number | null;
  },
): Promise<void> {
  if (args.wasTracked || !args.trackStock) return;
  if (args.openingStock === null) {
    // The actions check this before the transaction opens.
    throw new Error("An opening count is required to start tracking stock");
  }

  await tx
    .update(items)
    .set({ stockQuantity: args.openingStock, updatedAt: new Date() })
    .where(eq(items.id, args.itemId));
  await tx.insert(stockMovements).values({
    itemId: args.itemId,
    type: "OPENING",
    quantityDelta: args.openingStock - args.storedQuantity,
    quantityAfter: args.openingStock,
    createdBy: args.userId,
  });
}
