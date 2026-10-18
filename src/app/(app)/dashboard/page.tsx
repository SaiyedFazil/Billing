import { Container } from "@/components/layout/Container";
import { DashboardPage } from "@/components/pages/dashboard/DashboardPage";
import { requireUser } from "@/lib/auth/guard";
import { eachDateInRange, presetRange } from "@/lib/utils/date-range";
import {
  getDashboardStats,
  getItemSales,
  getSalesTrend,
} from "@/server/reports/reports-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";
import { getStockAlerts } from "@/server/stock/stock-queries";

export const metadata = {
  title: "Dashboard",
  description: "Today's sales at a glance.",
};

export default async function Page() {
  // Both roles may view reports — see spec §7.1.
  const user = await requireUser();

  const timeZone = await getShopTimezone();
  const week = presetRange("LAST_7", timeZone);
  const today = presetRange("TODAY", timeZone);

  const [stats, trend, topItems, stockAlerts] = await Promise.all([
    getDashboardStats(),
    getSalesTrend(week.from, week.to),
    getItemSales(today.from, today.to),
    getStockAlerts(),
  ]);

  return (
    <Container>
      <DashboardPage
        stats={stats}
        trend={trend}
        topItems={topItems}
        chartDates={eachDateInRange(week.from, week.to)}
        stockAlerts={stockAlerts}
        canManageStock={user.role === "SUPERADMIN"}
      />
    </Container>
  );
}
