import { and, asc, eq } from "drizzle-orm";

import type { db } from "@/db";
import { items } from "@/db/schema";

/** The transaction handle db.transaction() hands its callback. */
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Renumbers one category's items to 0, 1, 2, … in their current order,
 * optionally moving one item to a given position first.
 *
 * `position` is where the item should LAND, not an amount to shift by. The
 * item is lifted out of the list and reinserted at that index, which is what
 * makes a move work in both directions: sending an item to a lower number
 * pushes the rest down, and sending it to a higher one pulls them up. A plain
 * "+1 to everything at or after N" only ever gets the first case right.
 *
 * Because every item is then renumbered from zero, the numbering can never
 * drift into gaps or duplicates — including any this category already had.
 *
 * Only active items take part. Retired ones never reach the till, so
 * renumbering them would be churn for no visible effect.
 *
 * MUST be called inside a transaction, alongside the write that prompted it:
 * a renumber that committed without its item write would reorder the menu for
 * no reason.
 *
 * Returns the position the placed item actually ended up at, which is the
 * requested one clamped to the category's size — so asking for 9999 means
 * "last" rather than leaving a gap.
 */
export async function renumberCategory(
  tx: Transaction,
  categoryId: string,
  place?: { itemId: string; position: number },
): Promise<number | null> {
  const rows = await tx
    .select({ id: items.id, sortOrder: items.sortOrder })
    .from(items)
    .where(and(eq(items.categoryId, categoryId), eq(items.isActive, true)))
    .orderBy(asc(items.sortOrder), asc(items.name));

  let ordered = rows.map((row) => row.id);
  let placedAt: number | null = null;

  if (place) {
    const others = ordered.filter((id) => id !== place.itemId);
    placedAt = Math.min(Math.max(place.position, 0), others.length);
    others.splice(placedAt, 0, place.itemId);
    ordered = others;
  }

  const currentById = new Map(rows.map((row) => [row.id, row.sortOrder]));

  // Sequential, not Promise.all: a transaction is one connection, and a menu
  // is a dozen rows. Rows already at their target number are left alone.
  for (const [index, id] of ordered.entries()) {
    if (currentById.get(id) === index) continue;
    // updatedAt is deliberately untouched. Being pushed along by a neighbour
    // is not an edit to this item, and bumping it would make the whole
    // category look freshly changed every time one item moves.
    await tx.update(items).set({ sortOrder: index }).where(eq(items.id, id));
  }

  return placedAt;
}
