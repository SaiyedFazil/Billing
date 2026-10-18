import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import { toAmount } from "@/lib/utils/money";
import type { AdminItemRow, MenuCategory } from "@/types/item.types";

/**
 * The billing screen's entire dataset, fetched once per page load.
 *
 * Retired items and categories (is_active = false) are excluded entirely.
 * Sold-out items (is_available = false) are INCLUDED so the cashier sees them
 * greyed out rather than wondering where they went.
 */
export async function getMenu(): Promise<MenuCategory[]> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({
        categoryId: categories.id,
        categoryName: categories.name,
        itemId: items.id,
        itemName: items.name,
        price: items.price,
        imageUrl: items.imageUrl,
        isAvailable: items.isAvailable,
        trackStock: items.trackStock,
        stockQuantity: items.stockQuantity,
        lowStockThreshold: items.lowStockThreshold,
      })
      .from(categories)
      .innerJoin(items, eq(items.categoryId, categories.id))
      .where(and(eq(categories.isActive, true), eq(items.isActive, true)))
      .orderBy(
        asc(categories.sortOrder),
        asc(categories.name),
        asc(items.sortOrder),
        asc(items.name),
      );

    // Rows arrive already ordered, so grouping preserves that order.
    const grouped = new Map<string, MenuCategory>();

    for (const row of rows) {
      let category = grouped.get(row.categoryId);
      if (!category) {
        category = { id: row.categoryId, name: row.categoryName, items: [] };
        grouped.set(row.categoryId, category);
      }
      category.items.push({
        id: row.itemId,
        categoryId: row.categoryId,
        name: row.itemName,
        price: toAmount(row.price),
        imageUrl: row.imageUrl,
        isAvailable: row.isAvailable,
        trackStock: row.trackStock,
        stockQuantity: row.stockQuantity,
        lowStockThreshold: row.lowStockThreshold,
      });
    }

    return [...grouped.values()];
  });
}

/**
 * Every active item with its category name, for the management table.
 * Unlike getMenu() this is flat — the admin table is not grouped.
 */
export async function listItemsForAdmin(): Promise<AdminItemRow[]> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({
        id: items.id,
        name: items.name,
        categoryId: items.categoryId,
        categoryName: categories.name,
        price: items.price,
        imageUrl: items.imageUrl,
        imageFileId: items.imageFileId,
        isAvailable: items.isAvailable,
        sortOrder: items.sortOrder,
        trackStock: items.trackStock,
        stockQuantity: items.stockQuantity,
        lowStockThreshold: items.lowStockThreshold,
      })
      .from(items)
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .where(eq(items.isActive, true))
      .orderBy(
        asc(categories.sortOrder),
        asc(categories.name),
        asc(items.sortOrder),
        asc(items.name),
      );

    return rows.map((row) => ({ ...row, price: toAmount(row.price) }));
  });
}
