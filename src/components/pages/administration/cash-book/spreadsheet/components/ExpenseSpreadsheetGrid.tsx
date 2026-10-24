import { Ban } from "lucide-react";

import { EXPENSE_MODE_LABELS } from "@/constants/expense-modes";
import { cn } from "@/lib/utils";
import { CASH_GROUP_LABELS, expenseModeGroup } from "@/lib/utils/cash-book";
import { businessDate, formatBillTime } from "@/lib/utils/dates";
import { formatSheetDate } from "@/lib/utils/expense-spreadsheet";
import { formatINR } from "@/lib/utils/money";
import type { ExpenseRow } from "@/types/expense.types";

/** Header labels in column order. The row-number column comes first. */
const COLUMNS = [
  { label: "Date" },
  { label: "Category" },
  { label: "Paid to" },
  { label: "Note" },
  { label: "Paid by" },
  { label: "Cash / Online" },
  { label: "Amount", align: "text-right" },
  { label: "Entered by" },
  { label: "Entered at" },
] as const;

// Separate borders, right and bottom only: with border-collapse a sticky
// header or footer scrolls its borders away from it.
const CELL =
  "border-r border-b border-border px-2.5 py-1.5 whitespace-nowrap last:border-r-0";
const NUMBER_CELL =
  "sticky left-0 z-1 w-12 border-r border-b border-border bg-muted px-2 py-1.5 text-center text-[11px] font-semibold text-muted-foreground";

/** "20-10-2026 11:42", in the shop's timezone. */
function enteredAt(iso: string, timeZone: string): string {
  const at = new Date(iso);
  return `${formatSheetDate(businessDate(at, timeZone))} ${formatBillTime(at, timeZone)}`;
}

/** A blank optional field reads as a dash, as in the Expenses table. */
function Optional({ value }: { value: string | null }) {
  return value ? value : <span className="text-muted-foreground">—</span>;
}

/**
 * The read-only audit grid: gridlines, a numbered gutter, a header and a
 * gutter that stay put while scrolling, and the filter's total underneath.
 * A cancelled expense stays listed, struck through, and is not in the total.
 */
export function ExpenseSpreadsheetGrid({
  rows,
  firstRowNumber,
  total,
  timeZone,
}: {
  rows: ExpenseRow[];
  /** The number shown in the gutter of the first row on this page. */
  firstRowNumber: number;
  /** Every active expense the filters select, across all pages. */
  total: string;
  timeZone: string;
}) {
  return (
    <div className="max-h-[calc(100dvh-22rem)] overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-[13px] tabular-nums">
        <thead className="sticky top-0 z-2">
          <tr>
            <th scope="col" className={cn(NUMBER_CELL, "z-3 bg-muted")}>
              <span className="sr-only">Row</span>#
            </th>
            {COLUMNS.map((column) => (
              <th
                key={column.label}
                scope="col"
                className={cn(
                  CELL,
                  "bg-table-head text-left font-semibold",
                  "align" in column && column.align,
                )}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => {
            const cancelled = row.cancelledAt !== null;
            return (
              <tr
                key={row.id}
                title={
                  cancelled
                    ? `Cancelled: ${row.cancelReason ?? "no reason given"}`
                    : undefined
                }
                className={cn(
                  "bg-card",
                  // Struck per cell: a line on the row would strike the
                  // row number too, and a cell cannot undo it.
                  cancelled &&
                    "text-muted-foreground [&>td:not(:first-child)]:line-through",
                )}
              >
                <td
                  className={cn(NUMBER_CELL, cancelled && "text-destructive")}
                >
                  <span className="inline-flex items-center gap-1">
                    {cancelled ? (
                      <>
                        <Ban aria-hidden className="size-3" />
                        <span className="sr-only">Cancelled</span>
                      </>
                    ) : null}
                    {firstRowNumber + index}
                  </span>
                </td>
                <td className={CELL}>{formatSheetDate(row.expenseDate)}</td>
                <td className={CELL}>{row.categoryName}</td>
                <td className={CELL}>
                  <Optional value={row.paidTo} />
                </td>
                <td className={cn(CELL, "max-w-72 truncate")}>
                  <Optional value={row.note} />
                </td>
                <td className={CELL}>{EXPENSE_MODE_LABELS[row.mode]}</td>
                <td className={CELL}>
                  {CASH_GROUP_LABELS[expenseModeGroup(row.mode)]}
                </td>
                <td className={cn(CELL, "text-right font-semibold")}>
                  {formatINR(row.amount)}
                </td>
                <td className={CELL}>{row.createdByName}</td>
                <td className={CELL}>
                  {enteredAt(row.createdAt, timeZone)}
                  {row.edited ? (
                    <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Edited
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot className="sticky bottom-0 z-2">
          <tr className="font-semibold [&>td]:border-b-0">
            <td className={cn(NUMBER_CELL, "z-3")} />
            <td colSpan={6} className={cn(CELL, "bg-table-head")}>
              Total{" "}
              <span className="font-normal text-muted-foreground">
                (all pages, cancelled not counted)
              </span>
            </td>
            <td
              className={cn(
                CELL,
                "bg-table-head text-right font-heading font-bold",
              )}
            >
              {formatINR(total)}
            </td>
            <td colSpan={2} className={cn(CELL, "bg-table-head")} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
