"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { bills } from "@/db/schema";
import { guarded, requireUser } from "@/lib/auth/guard";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { createBillSchema } from "@/lib/validation/bill-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";
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
 *
 * Reading a receipt is not a reprint, so this writes no audit entry — only
 * reprintBillAction does, because only that hands out a second paper copy.
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

/**
 * Records that a receipt was reprinted, then the caller opens /print/[id].
 *
 * Without this, "reprint" is an untraceable way to hand out a second copy of a
 * receipt. See spec §9.
 */
export async function reprintBillAction(payload: {
  billId: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireUser();

    const bill = await db.query.bills.findFirst({
      where: eq(bills.id, payload.billId),
      columns: { id: true, billNumber: true, businessDate: true },
    });
    if (!bill) return fail<null>("NOT_FOUND", "That bill no longer exists.");

    await writeAuditLog({
      actorId: user.id,
      action: "BILL_REPRINTED",
      entityType: "bill",
      entityId: bill.id,
      after: { billNumber: bill.billNumber, businessDate: bill.businessDate },
    });

    return ok(null);
  });
}
