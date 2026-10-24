"use client";

import { ArrowLeft, ChevronLeft, ChevronRight, Sheet } from "lucide-react";
import Link from "next/link";

import { TableCard } from "@/components/custom/TableCard";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import {
  DEFAULT_SPREADSHEET_PAGE_SIZE,
  expenseListHref,
  parsePageSize,
  SPREADSHEET_PAGE_SIZES,
  type SpreadsheetPageSize,
} from "@/lib/utils/expense-spreadsheet";
import type { PresetMap } from "@/lib/utils/report-params";
import type {
  ExpenseCategoryRow,
  ExpenseMonth,
  ExpensePage,
} from "@/types/expense.types";

import { ExpensesTableToolbar } from "../components/ExpensesTableToolbar";
import { ExpenseSpreadsheetGrid } from "./components/ExpenseSpreadsheetGrid";
import { SpreadsheetPeriodBar } from "./components/SpreadsheetPeriodBar";
import {
  type SpreadsheetPeriod,
  useExpenseSpreadsheet,
} from "./hooks/useExpenseSpreadsheet";

/**
 * The Cash book's expenses as a read-only spreadsheet, for audit. Same list
 * query and filters as the Expenses table; nothing here can change an
 * expense.
 */
export function ExpenseSpreadsheetTab({
  from,
  to,
  presets,
  period,
  filters,
  pageSize,
  expensePage,
  total,
  months,
  categories,
  timeZone,
}: {
  from: string;
  to: string;
  presets: PresetMap;
  period: SpreadsheetPeriod;
  filters: { group: string; categoryId: string };
  pageSize: SpreadsheetPageSize;
  expensePage: ExpensePage;
  total: string;
  months: ExpenseMonth[];
  categories: ExpenseCategoryRow[];
  timeZone: string;
}) {
  const sheet = useExpenseSpreadsheet({ from, months });

  const lastPage = Math.max(
    1,
    Math.ceil(expensePage.total / expensePage.pageSize),
  );
  const firstRow =
    expensePage.total === 0
      ? 0
      : (expensePage.page - 1) * expensePage.pageSize + 1;
  const lastRow = Math.min(
    expensePage.page * expensePage.pageSize,
    expensePage.total,
  );
  const isFiltered = Boolean(filters.group || filters.categoryId);

  const backHref = expenseListHref(ADMIN_ROUTES.cashBook, {
    from,
    to,
    ...filters,
  });

  // Carried across a date range change, so it keeps the owner's filters and
  // rows per page. The default page size stays out of the URL.
  const keepParams = {
    group: filters.group,
    categoryId: filters.categoryId,
    rows: pageSize === DEFAULT_SPREADSHEET_PAGE_SIZE ? "" : String(pageSize),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses spreadsheet"
        description="Every expense in the period, laid out for audit."
        leading={
          <Button variant="outline" size="icon" className="mt-1" asChild>
            <Link href={backHref} aria-label="Back to Cash book">
              <ArrowLeft />
            </Link>
          </Button>
        }
      />

      <SpreadsheetPeriodBar
        period={period}
        from={from}
        to={to}
        presets={presets}
        months={months}
        keepParams={keepParams}
        disabled={sheet.isPending}
        onPeriodChange={sheet.setPeriod}
        onMonthChange={sheet.setMonth}
      />

      <TableCard
        footer={
          expensePage.total > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">
                Showing{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {firstRow}–{lastRow}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {expensePage.total}
                </span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  id="rows-per-page"
                  className="text-sm text-muted-foreground"
                >
                  Rows per page
                </span>
                <Select
                  value={String(pageSize)}
                  disabled={sheet.isPending}
                  onValueChange={(value) =>
                    sheet.setPageSize(parsePageSize(value))
                  }
                >
                  <SelectTrigger
                    size="sm"
                    className="w-20"
                    aria-labelledby="rows-per-page"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SPREADSHEET_PAGE_SIZES.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={expensePage.page <= 1 || sheet.isPending}
                  onClick={() => sheet.goToPage(expensePage.page - 1)}
                >
                  <ChevronLeft />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={expensePage.page >= lastPage || sheet.isPending}
                  onClick={() => sheet.goToPage(expensePage.page + 1)}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </>
          ) : undefined
        }
      >
        <div className="border-b px-4 py-3">
          <ExpensesTableToolbar
            group={filters.group}
            categoryId={filters.categoryId}
            categories={categories}
            disabled={sheet.isPending}
            onGroupChange={sheet.setGroup}
            onCategoryChange={sheet.setCategory}
          />
        </div>

        {expensePage.rows.length === 0 ? (
          <div className="p-4">
            <TableEmptyState
              icon={Sheet}
              title="No expenses in this period"
              description={
                isFiltered
                  ? "Try another payment or category."
                  : "Choose another month or date range."
              }
            />
          </div>
        ) : (
          <ExpenseSpreadsheetGrid
            rows={expensePage.rows}
            firstRowNumber={firstRow}
            total={total}
            timeZone={timeZone}
          />
        )}
      </TableCard>
    </div>
  );
}
