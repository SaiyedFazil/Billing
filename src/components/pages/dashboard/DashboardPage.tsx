import { formatBillDate } from "@/lib/utils/dates";
import { formatINR, isZero } from "@/lib/utils/money";
import type {
  DashboardStats,
  ItemSalesRow,
  SalesByDayRow,
} from "@/types/report.types";

import { SalesTrendChart } from "./components/SalesTrendChart";
import { StatCard } from "./components/StatCard";
import { TopItemsCard } from "./components/TopItemsCard";

export function DashboardPage({
  stats,
  trend,
  topItems,
  chartDates,
}: {
  stats: DashboardStats;
  trend: SalesByDayRow[];
  topItems: ItemSalesRow[];
  /** Every date in the window, so a closed day renders as a zero bar. */
  chartDates: string[];
}) {
  // Without this, a day with no sales is simply absent and the chart silently
  // compresses — making a closed Monday look like it never existed.
  const byDate = new Map(trend.map((row) => [row.businessDate, row.net]));
  const chartData = chartDates.map((date) => ({
    label: formatBillDate(date).slice(0, 5),
    net: Number(byDate.get(date) ?? "0"),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-muted-foreground text-sm">
          {formatBillDate(stats.businessDate)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sales"
          value={formatINR(stats.net)}
          hint={
            isZero(stats.discount)
              ? undefined
              : `after ${formatINR(stats.discount)} of discounts`
          }
        />
        <StatCard label="Bills" value={String(stats.billCount)} />
        <StatCard label="Average bill" value={formatINR(stats.averageBill)} />
        <StatCard
          label="Top item"
          value={stats.topItemName ?? "—"}
          hint={stats.topItemName ? `${stats.topItemQuantity} sold` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <SalesTrendChart data={chartData} />
        <TopItemsCard items={topItems} />
      </div>
    </div>
  );
}
