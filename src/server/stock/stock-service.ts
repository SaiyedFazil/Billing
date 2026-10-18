import { asc, eq, inArray } from "drizzle-orm";

import { items, stockMovements } from "@/db/schema";
import type { Transaction } from "@/db/transaction";

/**
 * Every change to a stock count goes through this file, and always writes a
 * stock_movements row in the same transaction. See the stock spec §6.2.
 */

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
