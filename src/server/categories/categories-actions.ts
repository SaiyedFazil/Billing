"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { fieldErrors } from "@/lib/utils/field-errors";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import {
  categorySchema,
  updateCategorySchema,
} from "@/lib/validation/category-schema";
import { countActiveItemsInCategory } from "@/server/categories/categories-queries";

/** Case-insensitive duplicate check among ACTIVE categories only. */
async function nameIsTaken(name: string, exceptId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        sql`lower(${categories.name}) = lower(${name})`,
        eq(categories.isActive, true),
        exceptId ? ne(categories.id, exceptId) : undefined,
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function createCategoryAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    await requireSuperadmin();

    const parsed = categorySchema.safeParse(payload);
    if (!parsed.success) {
      return fail<{ id: string }>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    if (await nameIsTaken(parsed.data.name)) {
      return fail<{ id: string }>(
        "CONFLICT",
        "A category with that name already exists.",
        { name: "Already in use" },
      );
    }

    const [created] = await db
      .insert(categories)
      .values({ name: parsed.data.name, sortOrder: parsed.data.sortOrder })
      .returning({ id: categories.id });

    revalidatePath(ADMIN_ROUTES.categories);
    revalidatePath("/bill");
    return ok(created);
  });
}

export async function updateCategoryAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    await requireSuperadmin();

    const parsed = updateCategorySchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    const { id, ...values } = parsed.data;

    const before = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That category no longer exists.");
    }

    if (await nameIsTaken(values.name, id)) {
      return fail<null>(
        "CONFLICT",
        "A category with that name already exists.",
        { name: "Already in use" },
      );
    }

    await db
      .update(categories)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(categories.id, id));

    revalidatePath(ADMIN_ROUTES.categories);
    revalidatePath("/bill");
    return ok(null);
  });
}

export async function deleteCategoryAction(payload: {
  id: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    await requireSuperadmin();

    const before = await db.query.categories.findFirst({
      where: eq(categories.id, payload.id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That category no longer exists.");
    }

    // Refuse rather than cascade: silently retiring a category's items would
    // pull them off the till with no warning.
    const itemCount = await countActiveItemsInCategory(payload.id);
    if (itemCount > 0) {
      return fail<null>(
        "CONFLICT",
        `“${before.name}” still has ${itemCount} item${itemCount === 1 ? "" : "s"}. ` +
          "Move or remove them first.",
      );
    }

    // Soft delete. Past bills keep their category-name snapshot.
    await db
      .update(categories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(categories.id, payload.id));

    revalidatePath(ADMIN_ROUTES.categories);
    revalidatePath("/bill");
    return ok(null);
  });
}
