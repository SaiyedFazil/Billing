import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type { CategoryRow } from "@/types/category.types";

/** Active categories with a count of their active items. */
export async function listCategories(): Promise<CategoryRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        id: categories.id,
        name: categories.name,
        sortOrder: categories.sortOrder,
        isActive: categories.isActive,
        itemCount: sql<number>`
          (SELECT count(*)::int FROM ${items}
           WHERE ${items.categoryId} = ${categories.id} AND ${items.isActive})
        `,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  );
}

/** Minimal list for the item form's category picker. */
export async function listCategoryOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  return withConnectionRetry(async () =>
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  );
}

export async function countActiveItemsInCategory(
  categoryId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.categoryId, categoryId), eq(items.isActive, true)));
  return row?.n ?? 0;
}
