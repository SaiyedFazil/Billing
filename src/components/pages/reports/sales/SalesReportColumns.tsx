import { TableCell, TableRow } from "@/components/ui/table";
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR, isZero } from "@/lib/utils/money";
import type { SalesByDayRow } from "@/types/report.types";

export const SALES_HEADERS = ["Date", "Bills", "Gross", "Discount", "Net"] as const;

export function SalesReportRow({ row }: { row: SalesByDayRow }) {
  return (
    <TableRow>
      <TableCell>{formatBillDate(row.businessDate)}</TableCell>
      <TableCell className="tabular-nums">{row.billCount}</TableCell>
      <TableCell className="tabular-nums">{formatINR(row.gross)}</TableCell>
      <TableCell className="tabular-nums">
        {isZero(row.discount) ? "—" : `-${formatINR(row.discount)}`}
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        {formatINR(row.net)}
      </TableCell>
    </TableRow>
  );
}
