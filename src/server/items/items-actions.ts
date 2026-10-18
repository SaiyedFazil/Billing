"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { deleteFile } from "@/lib/storage";
import { fieldErrors } from "@/lib/utils/field-errors";
import { compare } from "@/lib/utils/money";
import { startsTracking } from "@/lib/utils/stock";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { itemSchema, updateItemSchema } from "@/lib/validation/item-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";
import { renumberCategory } from "@/server/items/item-order-service";
import { applyTrackingChange } from "@/server/stock/stock-service";

const OPENING_STOCK_REQUIRED = "Enter the count on the shelf";

async function nameIsTaken(
  categoryId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(
      and(
        eq(items.categoryId, categoryId),
        sql`lower(${items.name}) = lower(${name})`,
        eq(items.isActive, true),
        exceptId ? ne(items.id, exceptId) : undefined,
      ),
    )
    .limit(1);

  return Boolean(row);
}

async function categoryIsActive(categoryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.isActive, true)))
    .limit(1);
  return Boolean(row);
}

/** Both the admin table and the billing screen change when an item changes. */
function revalidateItemSurfaces() {
  revalidatePath(ADMIN_ROUTES.items);
  revalidatePath("/bill");
}

export async function createItemAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<{ id: string }>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    if (!(await categoryIsActive(parsed.data.categoryId))) {
      return fail<{ id: string }>(
        "CONFLICT",
        "That category no longer exists.",
        { categoryId: "Choose another category" },
      );
    }

    if (await nameIsTaken(parsed.data.categoryId, parsed.data.name)) {
      return fail<{ id: string }>(
        "CONFLICT",
        "An item with that name already exists in this category.",
        { name: "Already in use" },
      );
    }

    const { openingStock, ...values } = parsed.data;
    if (startsTracking(false, values.trackStock) && openingStock === null) {
      return fail<{ id: string }>(
        "VALIDATION",
        "Check the highlighted fields.",
        {
          openingStock: OPENING_STOCK_REQUIRED,
        },
      );
    }

    // Every failure path is above; from here it is writes only, so returning
    // from the callback is the commit we want. See spec §13.1 rule 6.
    const { created, placedAt } = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(items)
        .values({ ...values, createdBy: user.id })
        .returning({ id: items.id });

      await applyTrackingChange(tx, {
        itemId: row.id,
        userId: user.id,
        wasTracked: false,
        storedQuantity: 0,
        trackStock: values.trackStock,
        openingStock,
      });

      // A new item claims its position and pushes the rest of the category
      // down, rather than quietly tying with whatever already sits there.
      const position = await renumberCategory(tx, parsed.data.categoryId, {
        itemId: row.id,
        position: parsed.data.sortOrder,
      });

      return { created: row, placedAt: position };
    });

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_CREATED",
      entityType: "item",
      entityId: created.id,
      // The position it landed at, which is the requested one clamped to the
      // size of the category.
      after: {
        ...values,
        sortOrder: placedAt ?? values.sortOrder,
        ...(values.trackStock ? { openingStock } : {}),
      },
    });

    revalidateItemSurfaces();
    return ok(created);
  });
}

export async function updateItemAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = updateItemSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    const { id, openingStock, ...values } = parsed.data;

    const before = await db.query.items.findFirst({ where: eq(items.id, id) });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That item no longer exists.");
    }

    if (!(await categoryIsActive(values.categoryId))) {
      return fail<null>("CONFLICT", "That category no longer exists.", {
        categoryId: "Choose another category",
      });
    }

    if (await nameIsTaken(values.categoryId, values.name, id)) {
      return fail<null>(
        "CONFLICT",
        "An item with that name already exists in this category.",
        { name: "Already in use" },
      );
    }

    if (
      startsTracking(before.trackStock, values.trackStock) &&
      openingStock === null
    ) {
      return fail<null>("VALIDATION", "Check the highlighted fields.", {
        openingStock: OPENING_STOCK_REQUIRED,
      });
    }

    const placedAt = await db.transaction(async (tx) => {
      // The count itself is never written here; see applyTrackingChange.
      await tx
        .update(items)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(items.id, id));

      await applyTrackingChange(tx, {
        itemId: id,
        userId: user.id,
        wasTracked: before.trackStock,
        storedQuantity: before.stockQuantity,
        trackStock: values.trackStock,
        openingStock,
      });

      const position = await renumberCategory(tx, values.categoryId, {
        itemId: id,
        position: values.sortOrder,
      });

      // Moved to a different category: the old one is left with a hole where
      // this item was, so close it.
      if (before.categoryId !== values.categoryId) {
        await renumberCategory(tx, before.categoryId);
      }

      return position;
    });

    // A price change is logged as its own action so price history stays
    // directly queryable without a separate table. See spec §6.8.
    if (compare(before.price, values.price) !== 0) {
      await writeAuditLog({
        actorId: user.id,
        action: "ITEM_PRICE_CHANGED",
        entityType: "item",
        entityId: id,
        before: { price: before.price },
        after: { price: values.price },
      });
    }

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_UPDATED",
      entityType: "item",
      entityId: id,
      before: {
        name: before.name,
        categoryId: before.categoryId,
        price: before.price,
        imageUrl: before.imageUrl,
        isAvailable: before.isAvailable,
        sortOrder: before.sortOrder,
        trackStock: before.trackStock,
        lowStockThreshold: before.lowStockThreshold,
      },
      after: {
        ...values,
        sortOrder: placedAt ?? values.sortOrder,
        ...(startsTracking(before.trackStock, values.trackStock)
          ? { openingStock }
          : {}),
      },
    });

    // Replacing the image orphans the old file in ImageKit; remove it.
    if (before.imageFileId && before.imageFileId !== values.imageFileId) {
      try {
        await deleteFile(before.imageFileId);
      } catch (error) {
        // A stale file costs a few KB. Never fail the save over it.
        console.error(
          "Failed to delete replaced image",
          before.imageFileId,
          error,
        );
      }
    }

    revalidateItemSurfaces();
    return ok(null);
  });
}

export async function deleteItemAction(payload: {
  id: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const before = await db.query.items.findFirst({
      where: eq(items.id, payload.id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That item no longer exists.");
    }

    await db.transaction(async (tx) => {
      // Soft delete only. A hard delete would orphan or cascade sales history.
      await tx
        .update(items)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(items.id, payload.id));

      // Retiring an item leaves a hole in its category's numbering; close it
      // so the remaining items stay 0, 1, 2, …
      await renumberCategory(tx, before.categoryId);
    });

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_DELETED",
      entityType: "item",
      entityId: payload.id,
      before: { name: before.name, price: before.price },
    });

    // The image is deliberately NOT deleted — a retired item may still be
    // opened from an old bill, and the storage cost is negligible.

    revalidateItemSurfaces();
    return ok(null);
  });
}

export async function toggleItemAvailabilityAction(payload: {
  id: string;
  isAvailable: boolean;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const before = await db.query.items.findFirst({
      where: eq(items.id, payload.id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That item no longer exists.");
    }

    await db
      .update(items)
      .set({ isAvailable: payload.isAvailable, updatedAt: new Date() })
      .where(eq(items.id, payload.id));

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_UPDATED",
      entityType: "item",
      entityId: payload.id,
      before: { isAvailable: before.isAvailable },
      after: { isAvailable: payload.isAvailable },
    });

    revalidateItemSurfaces();
    return ok(null);
  });
}
