import { ItemReportTab } from "@/components/pages/reports/items/ItemReportTab";
import { resolveReportRange } from "@/lib/utils/report-params";
import { getItemSales } from "@/server/reports/reports-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Item report",
  description: "Which items are selling.",
};

export default async function Page({
  searchParams,
}: PageProps<"/reports/items">) {
  const params = await searchParams;
  const timeZone = await getShopTimezone();
  const { from, to, presets } = resolveReportRange(params, timeZone, "LAST_30");

  const rows = await getItemSales(from, to);

  return <ItemReportTab from={from} to={to} presets={presets} rows={rows} />;
}
