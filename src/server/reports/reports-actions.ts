"use server";

import { guarded, requireUser } from "@/lib/auth/guard";
import { csvAmount, toCsv } from "@/lib/utils/csv";
import { rangeError } from "@/lib/utils/report-params";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { getItemSales, getSalesByDay } from "@/server/reports/reports-queries";

export type CsvPayload = { csv: string };

export async function exportSalesCsvAction(input: {
  from: string;
  to: string;
}): Promise<ActionResult<CsvPayload>> {
  return guarded(async () => {
    await requireUser();

    const invalid = rangeError(input);
    if (invalid) return fail<CsvPayload>("VALIDATION", invalid);

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

    const invalid = rangeError(input);
    if (invalid) return fail<CsvPayload>("VALIDATION", invalid);

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
