import { TableCell, TableRow } from "@/components/ui/table";
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR, isZero } from "@/lib/utils/money";
import type { SalesByDayRow } from "@/types/report.types";

export const SALES_HEADERS = [
  "Date",
  "Bills",
  "Gross",
  "Discount",
  "Net",
] as const;

/**
 * Columns that fold on a phone, where a row reads as two lines: the date and
 * its bill count on the left, Net with gross and discount under it on the
 * right.
 */
export const SALES_FOLDED = new Set<string>(["Bills", "Gross", "Discount"]);

/** The folded bill count, under the date on a phone. */
export function SalesFoldedBills({ billCount }: { billCount: number }) {
  return (
    <span className="block text-xs font-normal text-muted-foreground sm:hidden">
      {billCount} bill{billCount === 1 ? "" : "s"}
    </span>
  );
}

/** The folded gross and discount, under Net on a phone. */
export function SalesFoldedAmounts({
  gross,
  discount,
}: {
  gross: string;
  discount: string;
}) {
  return (
    <span className="block text-xs font-normal text-muted-foreground sm:hidden">
      <span className="block">{formatINR(gross)} gross</span>
      {isZero(discount) ? null : (
        <span className="block">-{formatINR(discount)} off</span>
      )}
    </span>
  );
}

export function SalesReportRow({ row }: { row: SalesByDayRow }) {
  return (
    <TableRow>
      <TableCell className="text-foreground/80 tabular-nums max-sm:align-top">
        {formatBillDate(row.businessDate)}
        <SalesFoldedBills billCount={row.billCount} />
      </TableCell>
      <TableCell className="text-right tabular-nums max-sm:hidden">
        {row.billCount}
      </TableCell>
      <TableCell className="text-right text-foreground/80 tabular-nums max-sm:hidden">
        {formatINR(row.gross)}
      </TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums max-sm:hidden">
        {isZero(row.discount) ? "—" : `-${formatINR(row.discount)}`}
      </TableCell>
      <TableCell className="text-right font-bold tabular-nums max-sm:align-top">
        {formatINR(row.net)}
        <SalesFoldedAmounts gross={row.gross} discount={row.discount} />
      </TableCell>
    </TableRow>
  );
}
