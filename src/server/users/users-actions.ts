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
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${parsed.data.username})`)
      .limit(1);

    if (existing) {
      return fail<{ id: string }>(
        "CONFLICT",
        "That username is already taken.",
        { username: "Already taken" },
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

export async function setUserActiveAction(payload: {
  id: string;
  isActive: boolean;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    if (payload.id === actor.id && !payload.isActive) {
      return fail<null>("CONFLICT", "You cannot deactivate your own account.");
    }

    const before = await db.query.users.findFirst({
      where: eq(users.id, payload.id),
    });
    if (!before) return fail<null>("NOT_FOUND", "That user no longer exists.");

    // Never leave the shop with no way in.
    if (!payload.isActive && before.role === "SUPERADMIN") {
      const remaining = await countActiveSuperadmins(payload.id);
      if (remaining === 0) {
        return fail<null>(
          "CONFLICT",
          "This is the last active owner account. Create another owner first.",
        );
      }
    }

    await db
      .update(users)
      .set({
        isActive: payload.isActive,
        // Reactivating clears any lockout so they can sign straight in.
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, payload.id));

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
    });
    if (!before) return fail<null>("NOT_FOUND", "That user no longer exists.");

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.password),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parsed.data.id));

    // Records THAT it happened, never the password itself.

    revalidatePath(ADMIN_ROUTES.users);
    return ok(null);
  });
}
