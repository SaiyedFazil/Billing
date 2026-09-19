import { SalesReportTab } from "@/components/pages/reports/sales/SalesReportTab";
import { resolveReportRange } from "@/lib/utils/report-params";
import {
  getPaymentBreakdown,
  getSalesByDay,
} from "@/server/reports/reports-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Sales report",
  description: "Takings per day over any date range.",
};

export default async function Page({ searchParams }: PageProps<"/reports/sales">) {
  const params = await searchParams;
  const timeZone = await getShopTimezone();
  const { from, to, presets } = resolveReportRange(params, timeZone, "LAST_7");

  const [rows, payments] = await Promise.all([
    getSalesByDay(from, to),
    getPaymentBreakdown(from, to),
  ]);

  return (
    <SalesReportTab
      from={from}
      to={to}
      presets={presets}
      rows={rows}
      payments={payments}
    />
  );
}
