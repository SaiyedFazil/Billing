"use client";

import { BadgePercent, IndianRupee, ReceiptText, TrendingUp } from "lucide-react";

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
import type { PresetMap } from "@/lib/utils/report-params";
import { add, formatINR, ZERO } from "@/lib/utils/money";
import { exportSalesCsvAction } from "@/server/reports/reports-actions";
import type { PaymentBreakdownRow, SalesByDayRow } from "@/types/report.types";

import { ExportCsvButton } from "../components/ExportCsvButton";
import { ReportDateRangeBar } from "../components/ReportDateRangeBar";
import { PaymentBreakdownCard } from "./components/PaymentBreakdownCard";
import { SALES_HEADERS, SalesReportRow } from "./SalesReportColumns";

export function SalesReportTab({
  from,
  to,
  presets,
  rows,
  payments,
}: {
  from: string;
  to: string;
  presets: PresetMap;
  rows: SalesByDayRow[];
  payments: PaymentBreakdownRow[];
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
        title="Sales"
        description="Takings per day. Voided bills are excluded."
        actions={
          <ExportCsvButton
            filename={`sales-${from}-to-${to}.csv`}
            onExport={() => exportSalesCsvAction({ from, to })}
            disabled={rows.length === 0}
          />
        }
      />

      <ReportDateRangeBar from={from} to={to} presets={presets} />

      <div className="grid gap-4 sm:grid-cols-3">
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
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  {SALES_HEADERS.map((header, index) => (
                    <TableHead
                      key={header}
                      className={index > 0 ? "text-right" : ""}
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
                <TableRow className="bg-brand-soft text-brand-ink hover:bg-brand-soft font-bold">
                  <TableCell>Total</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.billCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(totals.gross)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(totals.discount)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(totals.net)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableCard>

          {payments.length > 0 ? (
            <PaymentBreakdownCard payments={payments} totalNet={totals.net} />
          ) : null}
        </div>
      )}
    </div>
  );
}
