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
          <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
            <div
              className="bg-brand h-full rounded-full"
              style={{ width: `${Math.min(row.sharePercent, 100)}%` }}
            />
          </div>
          <span className="text-muted-foreground w-10 text-xs">
            {row.sharePercent}%
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}
