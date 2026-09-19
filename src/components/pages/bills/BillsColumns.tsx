import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { BillLedgerRow } from "@/types/report.types";

export const BILL_HEADERS = [
  "Bill",
  "Date",
  "Cashier",
  "Items",
  "Payment",
  "Total",
  "Status",
] as const;

export function BillTableRow({ row }: { row: BillLedgerRow }) {
  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell>
        <Link
          href={REPORT_ROUTES.bill(row.id)}
          className="font-medium underline-offset-4 hover:underline"
        >
          #{row.billNumber}
        </Link>
      </TableCell>
      <TableCell>{formatBillDate(row.businessDate)}</TableCell>
      <TableCell>{row.cashierName}</TableCell>
      <TableCell className="tabular-nums">{row.lineCount}</TableCell>
      <TableCell>{PAYMENT_METHOD_LABELS[row.paymentMethod]}</TableCell>
      <TableCell className="font-semibold tabular-nums">
        {formatINR(row.total)}
      </TableCell>
      <TableCell>
        {row.status === "VOID" ? (
          <Badge variant="destructive">Void</Badge>
        ) : (
          <Badge variant="secondary">Completed</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
