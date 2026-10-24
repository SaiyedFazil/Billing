import { ReportDateRangeBar } from "@/components/pages/reports/components/ReportDateRangeBar";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  groupMonthsByYear,
  monthLabel,
  monthOfRange,
} from "@/lib/utils/expense-spreadsheet";
import type { PresetMap } from "@/lib/utils/report-params";
import type { ExpenseMonth } from "@/types/expense.types";

import type { SpreadsheetPeriod } from "../hooks/useExpenseSpreadsheet";

const PERIODS: Array<{ value: SpreadsheetPeriod; label: string }> = [
  { value: "month", label: "Month" },
  { value: "range", label: "Date range" },
];

/**
 * Month or date range. Month offers only the months that have expenses, so
 * the owner never lands on an empty sheet; date range is the Cash book's bar.
 */
export function SpreadsheetPeriodBar({
  period,
  from,
  to,
  presets,
  months,
  keepParams,
  disabled,
  onPeriodChange,
  onMonthChange,
}: {
  period: SpreadsheetPeriod;
  from: string;
  to: string;
  presets: PresetMap;
  months: ExpenseMonth[];
  /** Filters and rows per page, carried across a date range change. */
  keepParams: Record<string, string>;
  disabled: boolean;
  onPeriodChange: (period: SpreadsheetPeriod) => void;
  onMonthChange: (month: string) => void;
}) {
  // A hand-edited URL can say "month" over a range that is not one month.
  const selectedMonth = monthOfRange(from, to) ?? "";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div
        role="group"
        aria-label="Period"
        className="flex gap-1 rounded-[14px] border bg-card p-1 shadow-card"
      >
        {PERIODS.map(({ value, label }) => {
          const active = value === period;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              disabled={disabled || (value === "month" && months.length === 0)}
              onClick={() => onPeriodChange(value)}
              className={cn(
                "h-9 cursor-pointer rounded-[10px] px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "bg-foreground font-semibold text-background"
                  : "font-medium text-foreground/80 hover:bg-muted",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {period === "month" ? (
        <Select
          value={selectedMonth}
          disabled={disabled || months.length === 0}
          onValueChange={onMonthChange}
        >
          <SelectTrigger className="w-52" aria-label="Month">
            {/* Given its own text: the item text carries the count too, which
                belongs in the list, not in the closed control. */}
            <SelectValue placeholder="Choose a month">
              {selectedMonth ? monthLabel(selectedMonth) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {groupMonthsByYear(months).map((group) => (
              <SelectGroup key={group.year}>
                <SelectLabel>{group.year}</SelectLabel>
                {group.months.map((entry) => (
                  <SelectItem key={entry.month} value={entry.month}>
                    <span className="flex w-full items-center justify-between gap-6">
                      {monthLabel(entry.month)}
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {entry.count}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="min-w-0 flex-1">
          <ReportDateRangeBar
            from={from}
            to={to}
            presets={presets}
            keepParams={keepParams}
          />
        </div>
      )}
    </div>
  );
}
