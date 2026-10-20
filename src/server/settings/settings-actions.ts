"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { shopSettings } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { fieldErrors } from "@/lib/utils/field-errors";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import {
  paymentMethodsSchema,
  settingsSchema,
} from "@/lib/validation/settings-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";
import { getShopSettings } from "@/server/settings/settings-queries";

export async function updateSettingsAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    const parsed = settingsSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    // A bad timezone would silently misfile every future bill's business date.
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: parsed.data.timezone });
    } catch {
      return fail<null>("VALIDATION", "That is not a valid timezone.", {
        timezone: "Try Asia/Kolkata",
      });
    }

    const before = await getShopSettings();

    // No WHERE clause: shop_settings holds exactly one row, enforced by the
    // shop_settings_singleton CHECK constraint.
    await db
      .update(shopSettings)
      .set({ ...parsed.data, updatedBy: actor.id, updatedAt: new Date() });

    await writeAuditLog({
      actorId: actor.id,
      action: "SETTINGS_UPDATED",
      entityType: "shop_settings",
      before: {
        shopName: before.shopName,
        addressLine: before.addressLine,
        phone: before.phone,
        receiptFooter: before.receiptFooter,
        receiptShowLogo: before.receiptShowLogo,
        printerWidth: before.printerWidth,
        timezone: before.timezone,
      },
      after: parsed.data,
    });

    revalidatePath(ADMIN_ROUTES.settings);
    // Every receipt renders these values.
    revalidatePath("/print", "layout");
    // The sidebar shows the shop name on every page.
    revalidatePath("/", "layout");
    return ok(null);
  });
}

/**
 * Saved on its own, separately from the receipt details above, so toggling a
 * payment method cannot also commit a half-typed shop name.
 */
export async function updatePaymentMethodsAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    const parsed = paymentMethodsSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Keep at least one payment method switched on.",
        fieldErrors(parsed.error),
      );
    }

    const before = await getShopSettings();

    // No WHERE clause: shop_settings holds exactly one row.
    await db.update(shopSettings).set({
      paymentMethods: parsed.data.paymentMethods,
      updatedBy: actor.id,
      updatedAt: new Date(),
    });

    await writeAuditLog({
      actorId: actor.id,
      action: "SETTINGS_UPDATED",
      entityType: "shop_settings",
      before: { paymentMethods: before.paymentMethods },
      after: { paymentMethods: parsed.data.paymentMethods },
    });

    revalidatePath(ADMIN_ROUTES.settings);
    // The till renders one button per enabled method.
    revalidatePath("/bill");
    return ok(null);
  });
}
