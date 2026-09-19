"use client";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import type { PresetMap } from "@/lib/utils/report-params";
import { add, formatINR, ZERO } from "@/lib/utils/money";
import { exportSalesCsvAction } from "@/server/reports/reports-actions";
import type { PaymentBreakdownRow, SalesByDayRow } from "@/types/report.types";

import { ExportCsvButton } from "../components/ExportCsvButton";
import { ReportDateRangeBar } from "../components/ReportDateRangeBar";
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sales</h1>
          <p className="text-muted-foreground text-sm">
            Takings per day. Voided bills are excluded.
          </p>
        </div>
        <ExportCsvButton
          filename={`sales-${from}-to-${to}.csv`}
          onExport={() => exportSalesCsvAction({ from, to })}
          disabled={rows.length === 0}
        />
      </div>

      <ReportDateRangeBar from={from} to={to} presets={presets} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Net takings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatINR(totals.net)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Bills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{totals.billCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Discounts given
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatINR(totals.discount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>By payment method</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            {payments.map((payment) => (
              <div key={payment.paymentMethod}>
                <p className="text-muted-foreground text-xs">
                  {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatINR(payment.net)}
                </p>
                <p className="text-muted-foreground text-xs">
                  {payment.billCount} bill{payment.billCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <TableEmptyState
          title="No sales in this range"
          description="Try a wider date range."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {SALES_HEADERS.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <SalesReportRow key={row.businessDate} row={row} />
            ))}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell>Total</TableCell>
              <TableCell className="tabular-nums">{totals.billCount}</TableCell>
              <TableCell className="tabular-nums">
                {formatINR(totals.gross)}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatINR(totals.discount)}
              </TableCell>
              <TableCell className="tabular-nums">
                {formatINR(totals.net)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}
