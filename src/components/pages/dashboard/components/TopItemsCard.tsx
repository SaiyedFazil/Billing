import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/utils/money";
import type { ItemSalesRow } from "@/types/report.types";

export function TopItemsCard({ items }: { items: ItemSalesRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top sellers today</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sales yet today.</p>
        ) : (
          <ol className="space-y-3">
            {items.slice(0, 5).map((item, index) => (
              <li key={item.itemName} className="flex items-center gap-3">
                <span className="text-muted-foreground w-4 text-sm tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.itemName}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.quantity} sold · {item.sharePercent}% of takings
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {formatINR(item.revenue)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
