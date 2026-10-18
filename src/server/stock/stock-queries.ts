import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { bills, categories, items, stockMovements, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type {
  StockAlertRow,
  StockAlerts,
  StockMovementRow,
} from "@/types/stock.types";

const ALERT_LIMIT = 6;

/** An item's most recent stock changes, newest first. */
export async function getStockHistory(
  itemId: string,
  limit = 10,
): Promise<StockMovementRow[]> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantityDelta: stockMovements.quantityDelta,
        quantityAfter: stockMovements.quantityAfter,
        note: stockMovements.note,
        createdAt: stockMovements.createdAt,
        createdByName: users.name,
        billNumber: bills.billNumber,
      })
      .from(stockMovements)
      .innerJoin(users, eq(users.id, stockMovements.createdBy))
      .leftJoin(bills, eq(bills.id, stockMovements.billId))
      .where(eq(stockMovements.itemId, itemId))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(limit);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

/**
 * Tracked items that need restocking, for the Dashboard. Retired items and
 * retired categories are left out. One query: the counts ride along as
 * window functions over the same filtered set.
 */
export async function getStockAlerts(): Promise<StockAlerts> {
  return withConnectionRetry(async () => {
    const isOut = sql`${items.stockQuantity} = 0`;
    const isLow = sql`${items.stockQuantity} > 0 AND ${items.stockQuantity} <= ${items.lowStockThreshold}`;

    const rows = await db
      .select({
        id: items.id,
        name: items.name,
        categoryName: categories.name,
        imageUrl: items.imageUrl,
        stockQuantity: items.stockQuantity,
        lowStockThreshold: items.lowStockThreshold,
        needsStock: sql<boolean>`${isOut} OR (${isLow})`,
        trackedCount: sql<number>`count(*) OVER ()`.mapWith(Number),
        low: sql<number>`count(*) FILTER (WHERE ${isLow}) OVER ()`.mapWith(
          Number,
        ),
        out: sql<number>`count(*) FILTER (WHERE ${isOut}) OVER ()`.mapWith(
          Number,
        ),
      })
      .from(items)
      .innerJoin(categories, eq(categories.id, items.categoryId))
      .where(
        and(
          eq(items.isActive, true),
          eq(categories.isActive, true),
          eq(items.trackStock, true),
        ),
      )
      .orderBy(asc(items.stockQuantity), asc(items.name));

    const first = rows[0];
    const alertItems: StockAlertRow[] = rows
      .filter((row) => row.needsStock)
      .slice(0, ALERT_LIMIT)
      .map((row) => ({
        id: row.id,
        name: row.name,
        categoryName: row.categoryName,
        imageUrl: row.imageUrl,
        stockQuantity: row.stockQuantity,
        lowStockThreshold: row.lowStockThreshold,
      }));

    return {
      trackedCount: first?.trackedCount ?? 0,
      low: first?.low ?? 0,
      out: first?.out ?? 0,
      items: alertItems,
    };
  });
}
