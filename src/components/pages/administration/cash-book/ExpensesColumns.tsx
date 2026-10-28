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
import { formatDayDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { ExpenseRow } from "@/types/expense.types";

import { ExpenseModePill } from "./components/ExpenseModePill";

/**
 * One entry per column: its header label and the width it asks for. Widths
 * live here and nowhere else, as in BillsColumns.
 */
export const EXPENSE_COLUMNS = [
  // On a phone the date, and below xl these three, move under the category,
  // so Amount always stays on screen.
  { label: "Date", width: "hidden w-40 sm:table-cell" },
  { label: "Category", width: "sm:min-w-40 xl:w-48" },
  { label: "Paid to", width: "hidden w-44 xl:table-cell" },
  { label: "Note", width: "hidden min-w-40 xl:table-cell" },
  { label: "Paid by", width: "hidden w-36 xl:table-cell" },
  { label: "Amount", width: "w-32 text-right" },
  // The row menu. Labelled for screen readers, blank on screen.
  { label: "Actions", width: "w-14", srOnly: true },
] as const;

/** A blank optional field reads as a dash, so an empty cell never looks broken. */
function Optional({ value }: { value: string | null }) {
  return value ? value : <span className="text-muted-foreground">—</span>;
}

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

  return (
    <TableRow className={cn(cancelled && "text-muted-foreground")}>
      <TableCell className="hidden align-top tabular-nums sm:table-cell">
        {formatDayDate(row.expenseDate)}
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{row.categoryName}</span>
          {cancelled ? <Badge variant="destructive">Cancelled</Badge> : null}
          {row.edited ? (
            <span className="text-xs text-muted-foreground">Edited</span>
          ) : null}
        </div>
        {cancelled && row.cancelReason ? (
          <p className="mt-0.5 text-xs text-destructive-ink">
            Reason: {row.cancelReason}
          </p>
        ) : null}
        {/* The narrow layout: the hidden columns, labelled, under the category. */}
        <div className="mt-1.5 space-y-1 text-xs text-muted-foreground xl:hidden">
          <p className="tabular-nums sm:hidden">
            {formatDayDate(row.expenseDate)}
          </p>
          {row.paidTo ? <p>Paid to: {row.paidTo}</p> : null}
          {row.note ? <p>Note: {row.note}</p> : null}
          <ExpenseModePill mode={row.mode} />
        </div>
      </TableCell>
      <TableCell className="hidden align-top whitespace-normal xl:table-cell">
        <Optional value={row.paidTo} />
      </TableCell>
      <TableCell className="hidden align-top whitespace-normal xl:table-cell">
        <Optional value={row.note} />
      </TableCell>
      <TableCell className="hidden align-top xl:table-cell">
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
