import Link from "next/link";

import { PaymentMethodLabel } from "@/components/custom/PaymentMethodLabel";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { cn } from "@/lib/utils";
import { formatBillDate } from "@/lib/utils/dates";
import { initials } from "@/lib/utils/initials";
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
  const isVoid = row.status === "VOID";

  return (
    <TableRow>
      <TableCell>
        <Link
          href={REPORT_ROUTES.bill(row.id)}
          className="font-mono font-semibold text-brand-ink underline-offset-4 hover:underline"
        >
          #{row.billNumber}
        </Link>
      </TableCell>
      <TableCell className="text-foreground/80 tabular-nums">
        {formatBillDate(row.businessDate)}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground/80">
            {initials(row.cashierName)}
          </span>
          {row.cashierName}
        </span>
      </TableCell>
      <TableCell className="text-foreground/80 tabular-nums">
        {row.lineCount}
      </TableCell>
      <TableCell>
        <PaymentMethodLabel method={row.paymentMethod} />
      </TableCell>
      <TableCell
        className={cn(
          "text-right font-bold tabular-nums",
          isVoid && "text-muted-foreground line-through",
        )}
      >
        {formatINR(row.total)}
      </TableCell>
      <TableCell>
        {isVoid ? (
          <Badge variant="destructive" dot>
            Void
          </Badge>
        ) : (
          <Badge variant="success" dot>
            Completed
          </Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
