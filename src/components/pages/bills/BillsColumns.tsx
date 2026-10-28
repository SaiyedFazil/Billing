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

/** A column shown from lg, folded into its row's other cells below it. */
const FOLDED = "hidden lg:table-cell";

/**
 * One entry per column: its header label and the width the column asks for.
 *
 * Widths live here and nowhere else. The table lays out automatically, so the
 * header row governs each column's width and the body cells below simply
 * follow — repeating a width on the cell is what lets the two drift apart.
 */
export const BILL_COLUMNS = [
  { label: "Bill", width: "lg:w-26" },
  // Below lg these four fold into the Bill and Total cells, so a phone reads
  // one two-line row per bill and never scrolls sideways.
  { label: "Date", width: `w-32 ${FOLDED}` },
  { label: "Cashier", width: `w-52 ${FOLDED}` },
  { label: "Items", width: `w-20 ${FOLDED}` },
  { label: "Payment", width: `w-32 ${FOLDED}` },
  { label: "Total", width: "w-32 max-lg:text-right" },
  { label: "Status", width: `w-36 ${FOLDED}` },
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
      <TableCell className="max-lg:align-top">
        <Link
          href={REPORT_ROUTES.bill(row.id)}
          className="font-mono font-semibold text-brand-ink underline-offset-4 hover:underline"
        >
          #{row.billNumber}
        </Link>
        {/* The folded columns. "Completed" is the normal state, so only Void
            is worth the room. */}
        {isVoid ? (
          <Badge variant="destructive" dot className="ml-2 lg:hidden">
            Void
          </Badge>
        ) : null}
        <span className="mt-1 block text-xs whitespace-normal text-muted-foreground lg:hidden">
          {formatBillDate(row.businessDate)} · {row.cashierName} ·{" "}
          {row.lineCount} item{row.lineCount === 1 ? "" : "s"}
        </span>
      </TableCell>
      <TableCell className={cn("text-foreground/80 tabular-nums", FOLDED)}>
        {formatBillDate(row.businessDate)}
      </TableCell>
      <TableCell className={FOLDED}>
        <span className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground/80">
            {initials(row.cashierName)}
          </span>
          {row.cashierName}
        </span>
      </TableCell>
      <TableCell className={cn("text-foreground/80 tabular-nums", FOLDED)}>
        {row.lineCount}
      </TableCell>
      <TableCell className={FOLDED}>
        <PaymentMethodLabel
          method={row.paymentMethod}
          splitPayments={row.splitPayments}
        />
      </TableCell>
      <TableCell
        className={cn(
          "font-bold tabular-nums max-lg:text-right max-lg:align-top",
          isVoid && "text-muted-foreground line-through",
        )}
      >
        {formatINR(row.total)}
        {/* The folded payment column. The label is inline-flex, so a void
            bill's line-through does not run through it. */}
        <span className="mt-1 flex justify-end font-normal lg:hidden">
          <PaymentMethodLabel
            method={row.paymentMethod}
            splitPayments={row.splitPayments}
          />
        </span>
      </TableCell>
      <TableCell className={FOLDED}>
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
      <TableCell className="text-right max-lg:align-top">
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
