"use server";

import { guarded, requireUser } from "@/lib/auth/guard";
import { csvAmount, toCsv } from "@/lib/utils/csv";
import { isValidIsoDate } from "@/lib/utils/date-range";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { getItemSales, getSalesByDay } from "@/server/reports/reports-queries";

export type CsvPayload = { csv: string };

/** Returns null when the range is fine, or the failure to return as-is. */
function invalidRange(input: {
  from: string;
  to: string;
}): ActionResult<CsvPayload> | null {
  if (!isValidIsoDate(input.from) || !isValidIsoDate(input.to)) {
    return fail<CsvPayload>("VALIDATION", "Choose a valid date range.");
  }
  if (input.from > input.to) {
    return fail<CsvPayload>(
      "VALIDATION",
      "The start date must be before the end date.",
    );
  }
  return null;
}

export async function exportSalesCsvAction(input: {
  from: string;
  to: string;
}): Promise<ActionResult<CsvPayload>> {
  return guarded(async () => {
    await requireUser();

    const invalid = invalidRange(input);
    if (invalid) return invalid;

    const rows = await getSalesByDay(input.from, input.to);

    return ok({
      csv: toCsv(rows, [
        { header: "Date", value: (r) => r.businessDate },
        { header: "Bills", value: (r) => r.billCount },
        { header: "Gross", value: (r) => csvAmount(r.gross) },
        { header: "Discount", value: (r) => csvAmount(r.discount) },
        { header: "Net", value: (r) => csvAmount(r.net) },
      ]),
    });
  });
}

export async function exportItemsCsvAction(input: {
  from: string;
  to: string;
}): Promise<ActionResult<CsvPayload>> {
  return guarded(async () => {
    await requireUser();

    const invalid = invalidRange(input);
    if (invalid) return invalid;

    const rows = await getItemSales(input.from, input.to);

    return ok({
      csv: toCsv(rows, [
        { header: "Item", value: (r) => r.itemName },
        { header: "Category", value: (r) => r.categoryName },
        { header: "Quantity", value: (r) => r.quantity },
        { header: "Revenue", value: (r) => csvAmount(r.revenue) },
        { header: "Share %", value: (r) => r.sharePercent },
      ]),
    });
  });
}
