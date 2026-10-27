"use client";

import { Flame } from "lucide-react";

import { TableCard } from "@/components/custom/TableCard";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { PresetMap } from "@/lib/utils/report-params";
import { exportItemsCsvAction } from "@/server/reports/reports-actions";
import type { ItemSalesRow } from "@/types/report.types";

import { ExportCsvButton } from "../components/ExportCsvButton";
import { ReportDateRangeBar } from "../components/ReportDateRangeBar";
import {
  ITEM_REPORT_FOLDED,
  ITEM_REPORT_HEADERS,
  ITEM_REPORT_NUMERIC,
  ItemReportRow,
} from "./ItemReportColumns";

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
      <PageHeader
        title="What's selling"
        description="Ranked by revenue. Names and prices are as they were at the time of sale."
        actions={
          <ExportCsvButton
            filename={`items-${from}-to-${to}.csv`}
            onExport={() => exportItemsCsvAction({ from, to })}
            disabled={rows.length === 0}
          />
        }
      />

      <ReportDateRangeBar from={from} to={to} presets={presets} />

      {rows.length === 0 ? (
        <TableEmptyState
          icon={Flame}
          title="No sales in this range"
          description="Try a wider date range."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                {ITEM_REPORT_HEADERS.map((header) => (
                  <TableHead
                    key={header}
                    className={cn(
                      ITEM_REPORT_NUMERIC.has(header) && "text-right",
                      ITEM_REPORT_FOLDED[header],
                    )}
                  >
                    {header}
                  </TableHead>
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
        </TableCard>
      )}
    </div>
  );
}
