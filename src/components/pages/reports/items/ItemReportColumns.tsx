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

/**
 * Columns that fold under the item name, and from which width: category and
 * share below lg, the quantity too on a phone.
 */
export const ITEM_REPORT_FOLDED: Record<string, string> = {
  Category: "max-lg:hidden",
  Share: "max-lg:hidden",
  "Qty sold": "max-sm:hidden",
};

function ShareBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className="w-10 text-xs text-muted-foreground">{percent}%</span>
    </div>
  );
}

export function ItemReportRow({ row }: { row: ItemSalesRow }) {
  return (
    <TableRow>
      <TableCell className="font-semibold max-lg:whitespace-normal">
        {row.itemName}
        {/* The folded columns: category and share of takings. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-normal tabular-nums lg:hidden">
          <Badge variant="secondary">{row.categoryName}</Badge>
          <span className="text-xs text-muted-foreground sm:hidden">
            {row.quantity} sold
          </span>
          <ShareBar percent={row.sharePercent} />
        </div>
      </TableCell>
      <TableCell className="max-lg:hidden">
        <Badge variant="secondary">{row.categoryName}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums max-sm:hidden">
        {row.quantity}
      </TableCell>
      <TableCell className="text-right font-bold tabular-nums">
        {formatINR(row.revenue)}
      </TableCell>
      <TableCell className="tabular-nums max-lg:hidden">
        <ShareBar percent={row.sharePercent} />
      </TableCell>
    </TableRow>
  );
}
