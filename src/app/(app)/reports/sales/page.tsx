import { SalesReportTab } from "@/components/pages/reports/sales/SalesReportTab";
import { requireUser } from "@/lib/auth/guard";
import { resolveReportRange } from "@/lib/utils/report-params";
import {
  getPaymentBreakdown,
  getSalesByDay,
  hasSplitBills,
} from "@/server/reports/reports-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Sales report",
  description: "Takings per day over any date range.",
};

export default async function Page({
  searchParams,
}: PageProps<"/reports/sales">) {
  await requireUser();

  const params = await searchParams;
  const timeZone = await getShopTimezone();
  const { from, to, presets } = resolveReportRange(params, timeZone, "LAST_7");

  const [rows, payments, showSplitNote] = await Promise.all([
    getSalesByDay(from, to),
    getPaymentBreakdown(from, to),
    hasSplitBills(from, to),
  ]);

  return (
    <SalesReportTab
      from={from}
      to={to}
      presets={presets}
      rows={rows}
      payments={payments}
      showSplitNote={showSplitNote}
    />
  );
}
