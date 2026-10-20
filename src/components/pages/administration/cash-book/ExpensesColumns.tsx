import { Ban, Ellipsis, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  // The row menu. Labelled for screen readers, blank on screen.
  { label: "Actions", width: "w-14", srOnly: true },
] as const;

export function ExpenseTableRow({
  row,
  onEdit,
  onCancel,
}: {
  row: ExpenseRow;
  onEdit: (row: ExpenseRow) => void;
  onCancel: (row: ExpenseRow) => void;
}) {
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
      <TableCell className="text-right align-top">
        {/* A cancelled expense is final: nothing left to do with it. */}
        {cancelled ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="-my-1.5 size-10"
                aria-label={`Actions for ${row.categoryName} ${formatINR(row.amount)}`}
              >
                <Ellipsis className="size-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(row)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onCancel(row)}
              >
                <Ban />
                Cancel expense
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </TableCell>
    </TableRow>
  );
}
