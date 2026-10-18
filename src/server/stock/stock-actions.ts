"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { fieldErrors } from "@/lib/utils/field-errors";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { adjustStockSchema } from "@/lib/validation/stock-schema";
import { getStockHistory } from "@/server/stock/stock-queries";
import { adjustStock } from "@/server/stock/stock-service";
import type { StockMovementRow } from "@/types/stock.types";

/** Owner only — stock counts are the owner's to change (stock spec §5). */
export async function adjustStockAction(
  payload: unknown,
): Promise<ActionResult<{ before: number; after: number }>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = adjustStockSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<{ before: number; after: number }>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error),
      );
    }

    const result = await adjustStock(parsed.data, user.id);

    // A refused adjustment may still mean the count moved under the dialog,
    // so the screens refresh either way.
    revalidatePath(ADMIN_ROUTES.items);
    revalidatePath("/bill");
    revalidatePath(REPORT_ROUTES.dashboard);
    return result;
  });
}

/** The Update stock dialog's Recent changes list. */
export async function getStockHistoryAction(payload: {
  itemId: string;
}): Promise<ActionResult<StockMovementRow[]>> {
  return guarded(async () => {
    await requireSuperadmin();

    const parsed = z.object({ itemId: z.uuid() }).safeParse(payload);
    if (!parsed.success) {
      return fail<StockMovementRow[]>("VALIDATION", "Invalid item.");
    }

    return ok(await getStockHistory(parsed.data.itemId));
  });
}
