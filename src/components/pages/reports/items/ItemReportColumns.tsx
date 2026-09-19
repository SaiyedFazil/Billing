import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/utils/money";
import type { ItemSalesRow } from "@/types/report.types";

export const ITEM_REPORT_HEADERS = [
  "Item",
  "Category",
  "Qty sold",
  "Revenue",
  "Share",
] as const;

/** Columns whose header and cells align right. */
export const ITEM_REPORT_NUMERIC = new Set<string>(["Qty sold", "Revenue"]);

export function ItemReportRow({ row }: { row: ItemSalesRow }) {
  return (
    <TableRow>
      <TableCell className="font-semibold">{row.itemName}</TableCell>
      <TableCell>
        <Badge variant="secondary">{row.categoryName}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
      <TableCell className="text-right font-bold tabular-nums">
        {formatINR(row.revenue)}
      </TableCell>
      <TableCell className="tabular-nums">
        <div className="flex items-center gap-2.5">
          <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.min(row.sharePercent, 100)}%` }}
            />
          </div>
          <span className="w-10 text-xs text-muted-foreground">
            {row.sharePercent}%
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}
