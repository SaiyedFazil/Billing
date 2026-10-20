import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { ExpenseRow } from "@/types/expense.types";

import { ExpenseModePill } from "./components/ExpenseModePill";

/**
 * One entry per column: its header label and the width it asks for. Widths
 * live here and nowhere else, as in BillsColumns.
 */
export const EXPENSE_COLUMNS = [
  { label: "Date", width: "w-24" },
  { label: "Category · paid to", width: "" },
  // On a phone the mode moves under the category, so Amount stays on screen.
  { label: "Mode", width: "hidden w-36 sm:table-cell" },
  { label: "Amount", width: "w-32 text-right" },
] as const;

export function ExpenseTableRow({ row }: { row: ExpenseRow }) {
  const cancelled = row.cancelledAt !== null;
  const details = [row.paidTo, row.note].filter(Boolean).join(" · ");

  return (
    <TableRow className={cn(cancelled && "text-muted-foreground")}>
      <TableCell className="align-top tabular-nums">
        {formatBillDate(row.expenseDate)}
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{row.categoryName}</span>
          {cancelled ? <Badge variant="destructive">Cancelled</Badge> : null}
          {row.edited ? (
            <span className="text-xs text-muted-foreground">Edited</span>
          ) : null}
        </div>
        {details ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{details}</p>
        ) : null}
        {cancelled && row.cancelReason ? (
          <p className="mt-0.5 text-xs text-destructive-ink">
            Reason: {row.cancelReason}
          </p>
        ) : null}
        <div className="mt-1.5 sm:hidden">
          <ExpenseModePill mode={row.mode} />
        </div>
      </TableCell>
      <TableCell className="hidden align-top sm:table-cell">
        <ExpenseModePill mode={row.mode} />
      </TableCell>
      <TableCell
        className={cn(
          "text-right align-top font-bold tabular-nums",
          cancelled && "line-through",
        )}
      >
        {formatINR(row.amount)}
      </TableCell>
    </TableRow>
  );
}
