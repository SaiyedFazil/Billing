"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { fieldErrors } from "@/lib/utils/field-errors";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import {
  createUserSchema,
  resetPasswordSchema,
  userIdSchema,
} from "@/lib/validation/user-schema";
import { countActiveSuperadmins } from "@/server/users/users-queries";

export async function createUserAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    const parsed = createUserSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<{ id: string }>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    const [existing] = await db
      .select({ isActive: users.isActive })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${parsed.data.username})`)
      .limit(1);

    // A deleted account keeps its username: its bills still carry it.
    if (existing) {
      return fail<{ id: string }>(
        "CONFLICT",
        existing.isActive
          ? "That username is already taken."
          : "That username belonged to a deleted account. Choose another.",
        { username: existing.isActive ? "Already taken" : "Used before" },
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        username: parsed.data.username,
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash: await hashPassword(parsed.data.password),
        createdBy: actor.id,
      })
      .returning({ id: users.id });

    revalidatePath(ADMIN_ROUTES.users);
    return ok(created);
  });
}

/**
 * Deletes an account, as far as the shop can see.
 *
 * The row itself stays: every bill, expense and stock movement the user made
 * points at it (bills.created_by is ON DELETE RESTRICT, and bills are frozen
 * by trigger), and their name stays on past receipts and reports. So delete
 * sets is_active = false — the account leaves the Users list, cannot sign in,
 * and every session it has open is sent to /login on its next request, since
 * the guards check is_active every time. There is no undo in the app.
 */
export async function deleteUserAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    const parsed = userIdSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>("NOT_FOUND", "That user no longer exists.");
    }
    const { id } = parsed.data;

    if (id === actor.id) {
      return fail<null>("CONFLICT", "You can't delete your own account.");
    }

    const before = await db.query.users.findFirst({
      where: eq(users.id, id),
      columns: { role: true, isActive: true },
    });
    if (!before?.isActive) {
      return fail<null>("NOT_FOUND", "That user no longer exists.");
    }

    // Never leave the shop with no way in.
    if (before.role === "SUPERADMIN") {
      const remaining = await countActiveSuperadmins(id);
      if (remaining === 0) {
        return fail<null>(
          "CONFLICT",
          "This is the last owner account. Create another owner first.",
        );
      }
    }

    await db
      .update(users)
      .set({
        isActive: false,
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));

    revalidatePath(ADMIN_ROUTES.users);
    return ok(null);
  });
}

export async function resetPasswordAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    await requireSuperadmin();

    const parsed = resetPasswordSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    const before = await db.query.users.findFirst({
      where: eq(users.id, parsed.data.id),
      columns: { isActive: true },
    });
    if (!before?.isActive) {
      return fail<null>("NOT_FOUND", "That user no longer exists.");
    }

    // A new hash means a new password stamp, so this signs the user out
    // everywhere: whoever knew the old password, or holds a cookie from it,
    // is sent to /login on their next request. That includes owners
    // resetting their own, on this device too — the page re-render that
    // follows this action does it. (Signing them straight back in does not
    // work: Auth.js reads the session from the request headers, which still
    // carry the old cookie during that re-render.)
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.password),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parsed.data.id));

    revalidatePath(ADMIN_ROUTES.users);
    return ok(null);
  });
}
