import { ReceiptText } from "lucide-react";
import Link from "next/link";

import { PaymentMethodLabel } from "@/components/custom/PaymentMethodLabel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { cn } from "@/lib/utils";
import { formatBillDate } from "@/lib/utils/dates";
import { initials } from "@/lib/utils/initials";
import { formatINR } from "@/lib/utils/money";
import type { BillLedgerRow } from "@/types/report.types";

/**
 * One entry per column: its header label and the width the column asks for.
 *
 * Widths live here and nowhere else. The table lays out automatically, so the
 * header row governs each column's width and the body cells below simply
 * follow — repeating a width on the cell is what lets the two drift apart.
 */
export const BILL_COLUMNS = [
  { label: "Bill", width: "w-26" },
  { label: "Date", width: "w-32" },
  { label: "Cashier", width: "w-52" },
  { label: "Items", width: "w-20" },
  { label: "Payment", width: "w-32" },
  { label: "Total", width: "w-32" },
  { label: "Status", width: "w-36" },
  // The preview button. Labelled for screen readers, blank on screen.
  { label: "Preview", width: "w-16", srOnly: true },
] as const;

export function BillTableRow({
  row,
  onPreview,
}: {
  row: BillLedgerRow;
  onPreview: (row: BillLedgerRow) => void;
}) {
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
        <PaymentMethodLabel
          method={row.paymentMethod}
          splitPayments={row.splitPayments}
        />
      </TableCell>
      <TableCell
        className={cn(
          "font-bold tabular-nums",
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
      <TableCell className="text-right">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Preview bill #${row.billNumber}`}
          onClick={() => onPreview(row)}
        >
          <ReceiptText className="size-5" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
