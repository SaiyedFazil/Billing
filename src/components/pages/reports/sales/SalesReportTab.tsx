"use client";

import {
  BadgePercent,
  IndianRupee,
  ReceiptText,
  TrendingUp,
} from "lucide-react";

import { StatCard } from "@/components/custom/StatCard";
import { TableCard } from "@/components/custom/TableCard";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PresetMap } from "@/lib/utils/report-params";
import { add, formatINR, ZERO } from "@/lib/utils/money";
import { exportSalesCsvAction } from "@/server/reports/reports-actions";
import type { PaymentBreakdownRow, SalesByDayRow } from "@/types/report.types";

import { ExportCsvButton } from "../components/ExportCsvButton";
import { ExportCsvMenu } from "../components/ExportCsvMenu";
import { ReportDateRangeBar } from "../components/ReportDateRangeBar";
import { PaymentBreakdownCard } from "./components/PaymentBreakdownCard";
import {
  SALES_FOLDED,
  SALES_HEADERS,
  SalesFoldedAmounts,
  SalesFoldedBills,
  SalesReportRow,
} from "./SalesReportColumns";

export function SalesReportTab({
  from,
  to,
  presets,
  rows,
  payments,
  showSplitNote,
}: {
  from: string;
  to: string;
  presets: PresetMap;
  rows: SalesByDayRow[];
  payments: PaymentBreakdownRow[];
  showSplitNote: boolean;
}) {
  const totals = rows.reduce(
    (accumulator, row) => ({
      billCount: accumulator.billCount + row.billCount,
      gross: add(accumulator.gross, row.gross),
      discount: add(accumulator.discount, row.discount),
      net: add(accumulator.net, row.net),
    }),
    { billCount: 0, gross: ZERO, discount: ZERO, net: ZERO },
  );

  return (
    <div className="space-y-6">
      <PageHeader
        className="max-sm:gap-y-0"
        title="Sales"
        description="Takings per day. Voided bills are excluded."
        actions={
          <ExportCsvButton
            filename={`sales-${from}-to-${to}.csv`}
            onExport={() => exportSalesCsvAction({ from, to })}
            disabled={rows.length === 0}
            className="max-sm:hidden"
          />
        }
      />

      <ReportDateRangeBar
        from={from}
        to={to}
        presets={presets}
        phoneActions={
          <ExportCsvMenu
            filename={`sales-${from}-to-${to}.csv`}
            onExport={() => exportSalesCsvAction({ from, to })}
            disabled={rows.length === 0}
          />
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          tone="hero"
          icon={IndianRupee}
          label="Net takings"
          value={formatINR(totals.net)}
        />
        <StatCard
          tone="mustard"
          icon={ReceiptText}
          label="Bills"
          value={String(totals.billCount)}
        />
        <StatCard
          tone="brand"
          icon={BadgePercent}
          label="Discounts given"
          value={formatINR(totals.discount)}
        />
      </div>

      {rows.length === 0 ? (
        <TableEmptyState
          icon={TrendingUp}
          title="No sales in this range"
          description="Try a wider date range."
        />
      ) : (
        // grid-cols-1: one column that never grows past the screen.
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  {SALES_HEADERS.map((header, index) => (
                    <TableHead
                      key={header}
                      className={cn(
                        index > 0 && "text-right",
                        SALES_FOLDED.has(header) && "max-sm:hidden",
                      )}
                    >
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <SalesReportRow key={row.businessDate} row={row} />
                ))}
                <TableRow className="bg-brand-soft font-bold text-brand-ink hover:bg-brand-soft">
                  <TableCell className="max-sm:align-top">
                    Total
                    <SalesFoldedBills billCount={totals.billCount} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-sm:hidden">
                    {totals.billCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-sm:hidden">
                    {formatINR(totals.gross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-sm:hidden">
                    {formatINR(totals.discount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums max-sm:align-top">
                    {formatINR(totals.net)}
                    <SalesFoldedAmounts
                      gross={totals.gross}
                      discount={totals.discount}
                    />
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableCard>

          {payments.length > 0 ? (
            <PaymentBreakdownCard
              payments={payments}
              totalNet={totals.net}
              showSplitNote={showSplitNote}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
