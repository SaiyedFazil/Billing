"use server";

import { z } from "zod";

import { guarded, requireUser } from "@/lib/auth/guard";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { createBillSchema } from "@/lib/validation/bill-schema";
import { createBill } from "@/server/bills/create-bill-service";
import { getReceipt } from "@/server/bills/bills-queries";
import type { CreatedBill, ReceiptData } from "@/types/bill.types";

/**
 * Thin by design: guard, validate, delegate, return. See spec §13.1 rule 6.
 */
export async function createBillAction(
  payload: unknown,
): Promise<ActionResult<CreatedBill>> {
  return guarded(async () => {
    const user = await requireUser();

    const parsed = createBillSchema.safeParse(payload);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join(".")] = issue.message;
      }
      return fail<CreatedBill>(
        "VALIDATION",
        "This bill could not be saved. Check the highlighted fields.",
        fields,
      );
    }

    return createBill(parsed.data, user.id);
  });
}

/**
 * One bill's receipt, for the preview dialog on the bills list.
 *
 * Fetched on demand rather than shipped with the ledger: a page of 25 bills
 * would carry 25 sets of lines for data that is usually never opened.
 */
export async function getBillReceiptAction(payload: {
  billId: string;
}): Promise<ActionResult<ReceiptData>> {
  return guarded(async () => {
    await requireUser();

    // Anything but a UUID would reach Postgres as a cast error rather than a
    // clean "not found".
    const parsed = z.uuid().safeParse(payload.billId);
    if (!parsed.success) {
      return fail<ReceiptData>("NOT_FOUND", "That bill no longer exists.");
    }

    const receipt = await getReceipt(parsed.data);
    if (!receipt) {
      return fail<ReceiptData>("NOT_FOUND", "That bill no longer exists.");
    }

    return ok(receipt);
  });
}
