"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { signIn } from "@/auth";
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
        // Deactivating already shuts every session out; this keeps them shut
        // if the account is reactivated before those cookies would expire.
        sessionVersion: sql`${users.sessionVersion} + 1`,
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
    const actor = await requireSuperadmin();

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
        // Signs the user out everywhere: whoever knew the old password, or
        // holds a cookie from it, is out on their next request.
        sessionVersion: sql`${users.sessionVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parsed.data.id));

    // Owners resetting their own password stay signed in on this device —
    // signed straight back in with the new password — while their other
    // devices are signed out.
    if (parsed.data.id === actor.id) {
      await signIn("credentials", {
        username: before.username,
        password: parsed.data.password,
        redirect: false,
      });
    }

    revalidatePath(ADMIN_ROUTES.users);
    return ok(null);
  });
}
