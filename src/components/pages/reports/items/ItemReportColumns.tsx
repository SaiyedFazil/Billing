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

export function ItemReportRow({ row }: { row: ItemSalesRow }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.itemName}</TableCell>
      <TableCell>
        <Badge variant="secondary">{row.categoryName}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{row.quantity}</TableCell>
      <TableCell className="font-semibold tabular-nums">
        {formatINR(row.revenue)}
      </TableCell>
      <TableCell className="tabular-nums">
        <div className="flex items-center gap-2">
          <div className="bg-muted h-2 w-16 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full"
              style={{ width: `${Math.min(row.sharePercent, 100)}%` }}
            />
          </div>
          <span className="text-muted-foreground text-xs">
            {row.sharePercent}%
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}
