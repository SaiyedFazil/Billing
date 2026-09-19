import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import type { ItemSalesRow } from "@/types/report.types";

export function TopItemsCard({ items }: { items: ItemSalesRow[] }) {
  return (
    <section className="flex flex-col gap-5 rounded-[20px] border bg-card p-6 shadow-card">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-bold">Top sellers today</h2>
        <p className="text-[13px] text-muted-foreground">By share of takings</p>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Flame className="size-5" />
          </span>
          <p className="text-sm text-muted-foreground">No sales yet today.</p>
        </div>
      ) : (
        <ol className="space-y-4">
          {items.slice(0, 5).map((item, index) => (
            <li key={item.itemName} className="flex items-start gap-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-[9px] text-[13px] font-bold",
                  index === 0
                    ? "bg-primary text-white"
                    : "bg-muted text-foreground/80",
                )}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-semibold">
                    {item.itemName}
                  </p>
                  <span className="text-sm font-bold tabular-nums">
                    {formatINR(item.revenue)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      index === 0 ? "bg-brand" : "bg-[#f7a58a]",
                    )}
                    style={{ width: `${Math.min(item.sharePercent, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} sold · {item.sharePercent}% of takings
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
