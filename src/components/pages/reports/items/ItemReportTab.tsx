"use client";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PresetMap } from "@/lib/utils/report-params";
import { exportItemsCsvAction } from "@/server/reports/reports-actions";
import type { ItemSalesRow } from "@/types/report.types";

import { ExportCsvButton } from "../components/ExportCsvButton";
import { ReportDateRangeBar } from "../components/ReportDateRangeBar";
import { ITEM_REPORT_HEADERS, ItemReportRow } from "./ItemReportColumns";

export function ItemReportTab({
  from,
  to,
  presets,
  rows,
}: {
  from: string;
  to: string;
  presets: PresetMap;
  rows: ItemSalesRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">What is selling</h1>
          <p className="text-muted-foreground text-sm">
            Ranked by revenue. Names and prices are as they were at the time of
            sale.
          </p>
        </div>
        <ExportCsvButton
          filename={`items-${from}-to-${to}.csv`}
          onExport={() => exportItemsCsvAction({ from, to })}
          disabled={rows.length === 0}
        />
      </div>

      <ReportDateRangeBar from={from} to={to} presets={presets} />

      {rows.length === 0 ? (
        <TableEmptyState
          title="No sales in this range"
          description="Try a wider date range."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {ITEM_REPORT_HEADERS.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <ItemReportRow
                key={`${row.categoryName}-${row.itemName}`}
                row={row}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
