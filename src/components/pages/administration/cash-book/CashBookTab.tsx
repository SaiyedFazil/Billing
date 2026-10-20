"use client";

import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Plus,
  Scale,
  Wallet,
} from "lucide-react";

import { StatCard } from "@/components/custom/StatCard";
import { TableCard } from "@/components/custom/TableCard";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { ExportCsvButton } from "@/components/pages/reports/components/ExportCsvButton";
import { ReportDateRangeBar } from "@/components/pages/reports/components/ReportDateRangeBar";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { CashBookDay, CashBookSummary } from "@/lib/utils/cash-book";
import { formatINR, isNegative } from "@/lib/utils/money";
import type { PresetMap } from "@/lib/utils/report-params";
import { exportExpensesCsvAction } from "@/server/expenses/expenses-actions";
import type {
  CategorySpendRow,
  ExpenseCategoryRow,
  ExpensePage,
} from "@/types/expense.types";

import { CancelExpenseDialog } from "./components/CancelExpenseDialog";
import { CashBookDaysTable } from "./components/CashBookDaysTable";
import { CashSplitLine } from "./components/CashSplitLine";
import { ExpensesTableToolbar } from "./components/ExpensesTableToolbar";
import { SpendByCategoryCard } from "./components/SpendByCategoryCard";
import { ExpenseDialog } from "./expense-dialog/ExpenseDialog";
import { useExpenseForm } from "./expense-dialog/hooks/useExpenseForm";
import { EXPENSE_COLUMNS, ExpenseTableRow } from "./ExpensesColumns";
import { type CashBookView, useCashBookTab } from "./hooks/useCashBookTab";
import { useCancelExpense } from "./hooks/useCancelExpense";

export function CashBookTab({
  from,
  to,
  presets,
  today,
  view: initialView,
  filters,
  summary,
  days,
  spend,
  expensePage,
  categories,
}: {
  from: string;
  to: string;
  presets: PresetMap;
  /** The shop's today, for the expense dialog's default date. */
  today: string;
  view: CashBookView;
  filters: { group: string; categoryId: string };
  summary: CashBookSummary;
  days: CashBookDay[];
  spend: CategorySpendRow[];
  expensePage: ExpensePage;
  categories: ExpenseCategoryRow[];
}) {
  const tab = useCashBookTab(initialView);
  const expenseForm = useExpenseForm({ today, categories });
  const cancel = useCancelExpense();

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cash book"
        description="Money in from bills and money out from expenses, cash and online."
        actions={
          <>
            <ExportCsvButton
              filename={`cash-book-${from}-to-${to}.csv`}
              onExport={() => exportExpensesCsvAction({ from, to })}
            />
            <Button onClick={expenseForm.openCreate}>
              <Plus />
              Add expense
            </Button>
          </>
        }
      />

      <ReportDateRangeBar from={from} to={to} presets={presets} />

      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          tone="basil"
          icon={ArrowDownLeft}
          label="Money in · bills"
          value={formatINR(summary.moneyIn.total)}
          hint={<CashSplitLine split={summary.moneyIn} />}
        />
        <StatCard
          tone="mustard"
          icon={ArrowUpRight}
          label="Money out · expenses"
          value={formatINR(summary.moneyOut.total)}
          hint={<CashSplitLine split={summary.moneyOut} />}
        />
        <StatCard
          tone="hero"
          icon={Scale}
          label="Net · in − out"
          value={formatINR(summary.net.total)}
          hint={
            <>
              <CashSplitLine split={summary.net} />
              {/* The minus sign carries it: destructive red fails contrast
                  on the dark hero card. */}
              {isNegative(summary.net.total) ? (
                <span className="mt-1 block">More went out than came in</span>
              ) : null}
            </>
          }
        />
      </div>

      <div
        className={cn(
          "grid items-start gap-4",
          spend.length > 0 && "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
        )}
      >
        <TableCard
          footer={
            tab.view === "expenses" && expensePage.total > 0 ? (
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
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={expensePage.page <= 1 || tab.isPending}
                    onClick={() => tab.goToPage(expensePage.page - 1)}
                  >
                    <ChevronLeft />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={expensePage.page >= lastPage || tab.isPending}
                    onClick={() => tab.goToPage(expensePage.page + 1)}
                  >
                    Next
                    <ChevronRight />
                  </Button>
                </div>
              </>
            ) : undefined
          }
        >
          <Tabs value={tab.view} onValueChange={tab.setView} className="gap-0">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <TabsList>
                <TabsTrigger value="expenses">Expenses</TabsTrigger>
                <TabsTrigger value="days">Day by day</TabsTrigger>
              </TabsList>
              {tab.view === "expenses" ? (
                <ExpensesTableToolbar
                  group={filters.group}
                  categoryId={filters.categoryId}
                  categories={categories}
                  disabled={tab.isPending}
                  onGroupChange={tab.setGroup}
                  onCategoryChange={tab.setCategory}
                />
              ) : null}
            </div>

            <TabsContent value="expenses">
              {expensePage.rows.length === 0 ? (
                <div className="p-4">
                  <TableEmptyState
                    icon={Wallet}
                    title="No expenses in this range"
                    description={
                      isFiltered
                        ? "Try another mode or category."
                        : "Expenses you add will appear here."
                    }
                    action={
                      isFiltered ? undefined : (
                        <Button onClick={expenseForm.openCreate}>
                          <Plus />
                          Add expense
                        </Button>
                      )
                    }
                  />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {EXPENSE_COLUMNS.map((column) => (
                        <TableHead key={column.label} className={column.width}>
                          {"srOnly" in column ? (
                            <span className="sr-only">{column.label}</span>
                          ) : (
                            column.label
                          )}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expensePage.rows.map((row) => (
                      <ExpenseTableRow
                        key={row.id}
                        row={row}
                        onEdit={expenseForm.openEdit}
                        onCancel={cancel.ask}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="days">
              <CashBookDaysTable days={days} summary={summary} />
            </TabsContent>
          </Tabs>
        </TableCard>

        {spend.length > 0 ? <SpendByCategoryCard spend={spend} /> : null}
      </div>

      <ExpenseDialog
        open={expenseForm.open}
        onOpenChange={(open) => (open ? null : expenseForm.close())}
        form={expenseForm.form}
        setField={expenseForm.setField}
        fieldErrors={expenseForm.fieldErrors}
        categories={expenseForm.categoryOptions}
        today={today}
        isPending={expenseForm.isPending}
        onSubmit={expenseForm.submit}
      />

      <CancelExpenseDialog
        expense={cancel.target}
        reason={cancel.reason}
        onReasonChange={cancel.setReason}
        error={cancel.error}
        isPending={cancel.isPending}
        onClose={cancel.close}
        onConfirm={cancel.confirm}
      />
    </div>
  );
}
