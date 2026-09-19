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
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { itemSchema, updateItemSchema } from "@/lib/validation/item-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";

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

    const [created] = await db
      .insert(items)
      .values({ ...parsed.data, createdBy: user.id })
      .returning({ id: items.id });

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_CREATED",
      entityType: "item",
      entityId: created.id,
      after: parsed.data,
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

    const { id, ...values } = parsed.data;

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

    await db
      .update(items)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(items.id, id));

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
      },
      after: values,
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

    // Soft delete only. A hard delete would orphan or cascade sales history.
    await db
      .update(items)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(items.id, payload.id));

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
