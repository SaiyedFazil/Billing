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
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR, isNegative, isZero } from "@/lib/utils/money";

const HEADERS = [
  "Date",
  "In · cash",
  "In · online",
  "Out · cash",
  "Out · online",
  "Net",
] as const;

function Amount({ value, net }: { value: string; net?: boolean }) {
  return (
    <TableCell
      className={cn(
        "text-right tabular-nums",
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
            {HEADERS.map((header) => (
              <TableHead
                key={header}
                className={header === "Date" ? "w-28" : "text-right"}
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.map((day) => (
            <TableRow key={day.date}>
              <TableCell className="text-foreground/80 tabular-nums">
                {formatBillDate(day.date)}
              </TableCell>
              <Amount value={day.inCash} />
              <Amount value={day.inOnline} />
              <Amount value={day.outCash} />
              <Amount value={day.outOnline} />
              <Amount value={day.net} net />
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">Total</TableCell>
            <Amount value={summary.moneyIn.cash} />
            <Amount value={summary.moneyIn.online} />
            <Amount value={summary.moneyOut.cash} />
            <Amount value={summary.moneyOut.online} />
            <Amount value={summary.net.total} net />
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
