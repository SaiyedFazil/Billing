import { CalendarDays } from "lucide-react";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CashBookDay, CashBookSummary } from "@/lib/utils/cash-book";
import { formatDayDate } from "@/lib/utils/dates";
import { formatINR, isNegative, isZero } from "@/lib/utils/money";

/** Draws the line between the Date, Money in, Money out and Net groups. */
const GROUP_EDGE = "border-l border-border/70";

/**
 * Below lg the table scrolls sideways, so the date stays pinned on the left.
 * A pinned cell needs its own background, and an inset shadow for its edge:
 * a collapsed table border would scroll away under it.
 */
const PINNED =
  "max-lg:sticky max-lg:left-0 max-lg:z-10 max-lg:shadow-[inset_-1px_0_0_var(--color-border)]";

function Amount({
  value,
  net,
  groupStart,
}: {
  value: string;
  net?: boolean;
  groupStart?: boolean;
}) {
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums",
        groupStart && GROUP_EDGE,
        // A zero steps back so the days' real figures stand out.
        isZero(value) && "text-muted-foreground",
        net && "font-bold",
        net && isNegative(value) && "text-destructive",
      )}
    >
      {formatINR(value)}
    </TableCell>
  );
}

/** One row per day that had a bill or an expense; the totals are the KPIs. */
export function CashBookDaysTable({
  days,
  summary,
}: {
  days: CashBookDay[];
  summary: CashBookSummary;
}) {
  if (days.length === 0) {
    return (
      <div className="p-4">
        <TableEmptyState
          icon={CalendarDays}
          title="Nothing in this range"
          description="No bills and no expenses fall between these dates."
        />
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead
              rowSpan={2}
              className={cn("max-lg:bg-table-head lg:w-48", PINNED)}
            >
              Date
            </TableHead>
            <TableHead
              colSpan={2}
              className={cn(
                "h-9 bg-success-soft text-center text-success-ink",
                GROUP_EDGE,
              )}
            >
              Money in
            </TableHead>
            <TableHead
              colSpan={2}
              className={cn(
                "h-9 bg-warning-soft text-center text-warning-ink",
                GROUP_EDGE,
              )}
            >
              Money out
            </TableHead>
            <TableHead rowSpan={2} className={cn("text-right", GROUP_EDGE)}>
              Net
            </TableHead>
          </TableRow>
          <TableRow>
            <TableHead className={cn("h-9 text-right", GROUP_EDGE)}>
              Cash
            </TableHead>
            <TableHead className="h-9 text-right">Online</TableHead>
            <TableHead className={cn("h-9 text-right", GROUP_EDGE)}>
              Cash
            </TableHead>
            <TableHead className="h-9 text-right">Online</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow key={day.date}>
              <TableCell
                className={cn(
                  "font-medium tabular-nums max-lg:bg-card",
                  PINNED,
                )}
              >
                {formatDayDate(day.date)}
              </TableCell>
              <Amount value={day.inCash} groupStart />
              <Amount value={day.inOnline} />
              <Amount value={day.outCash} groupStart />
              <Amount value={day.outOnline} />
              <Amount value={day.net} net groupStart />
            </TableRow>
          ))}
        </TableBody>
        <TableFooter className="bg-brand-soft font-bold text-brand-ink">
          <TableRow className="hover:bg-brand-soft">
            <TableCell className={cn("max-lg:bg-brand-soft", PINNED)}>
              Total
            </TableCell>
            <Amount value={summary.moneyIn.cash} groupStart />
            <Amount value={summary.moneyIn.online} />
            <Amount value={summary.moneyOut.cash} groupStart />
            <Amount value={summary.moneyOut.online} />
            <Amount value={summary.net.total} net groupStart />
          </TableRow>
        </TableFooter>
      </Table>
      {isZero(summary.moneyIn.other) ? null : (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Net includes {formatINR(summary.moneyIn.other)} from bills paid as
          Other, which the till can&apos;t place as cash or online.
        </p>
      )}
    </>
  );
}
