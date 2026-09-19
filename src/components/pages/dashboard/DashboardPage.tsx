import {
  Flame,
  IndianRupee,
  Plus,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";
import Link from "next/link";

import { StatCard } from "@/components/custom/StatCard";
import { NEW_BILL_HREF } from "@/components/layout/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { formatBillDate, formatLongDate } from "@/lib/utils/dates";
import { formatINR, isZero } from "@/lib/utils/money";
import type {
  DashboardStats,
  ItemSalesRow,
  SalesByDayRow,
} from "@/types/report.types";

import { SalesTrendChart } from "./components/SalesTrendChart";
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
  const chartData = chartDates.map((date) => {
    const isToday = date === stats.businessDate;
    return {
      label: isToday ? "Today" : formatBillDate(date).slice(0, 5),
      net: Number(byDate.get(date) ?? "0"),
      isToday,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={formatLongDate(stats.businessDate)}
        title="Today"
        actions={
          // Phones already have New bill in the top bar.
          <Button asChild className="max-lg:hidden">
            <Link href={NEW_BILL_HREF}>
              <Plus className="size-4.5" strokeWidth={2.25} />
              New bill
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          tone="hero"
          icon={IndianRupee}
          label="Sales"
          value={formatINR(stats.net)}
          hint={
            isZero(stats.discount)
              ? undefined
              : `after ${formatINR(stats.discount)} of discounts`
          }
        />
        <StatCard
          tone="mustard"
          icon={ReceiptText}
          label="Bills"
          value={String(stats.billCount)}
        />
        <StatCard
          tone="basil"
          icon={ShoppingBag}
          label="Average bill"
          value={formatINR(stats.averageBill)}
        />
        <StatCard
          tone="brand"
          icon={Flame}
          label="Top item"
          value={stats.topItemName ?? "—"}
          hint={stats.topItemName ? `${stats.topItemQuantity} sold` : undefined}
          compact
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <SalesTrendChart data={chartData} />
        <TopItemsCard items={topItems} />
      </div>
    </div>
  );
}
