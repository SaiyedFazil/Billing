import { CashBookTab } from "@/components/pages/administration/cash-book/CashBookTab";
import { requireSuperadmin } from "@/lib/auth/guard";
import { businessDate } from "@/lib/utils/dates";
import { parseExpenseListParams } from "@/lib/utils/expense-list-params";
import { resolveReportRange } from "@/lib/utils/report-params";
import {
  getCashBook,
  getSpendByCategory,
  listActiveExpenseCategories,
  listExpenses,
} from "@/server/expenses/expenses-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Cash book",
  description: "Money in from bills and money out from expenses.",
};

const PAGE_SIZE = 25;

export default async function Page({
  searchParams,
}: PageProps<"/administration/cash-book">) {
  // The layout gate is NOT enough: Next renders layout and page in parallel,
  // so without this the page would stream the owner's expenses to a cashier
  // before the layout's guard threw. See spec §7.2.
  await requireSuperadmin();

  const params = await searchParams;
  const timeZone = await getShopTimezone();
  const { from, to, presets } = resolveReportRange(
    params,
    timeZone,
    "THIS_MONTH",
  );

  const read = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  // A hand-edited URL falls back to the defaults rather than failing.
  const view = read("view") === "days" ? "days" : "expenses";
  const {
    group,
    groupParam: groupRaw,
    categoryId,
    page,
  } = parseExpenseListParams(read);

  const [cashBook, spend, expensePage, categories] = await Promise.all([
    getCashBook(from, to),
    getSpendByCategory(from, to),
    listExpenses({ from, to, group, categoryId }, page, PAGE_SIZE),
    listActiveExpenseCategories(),
  ]);

  return (
    <CashBookTab
      from={from}
      to={to}
      presets={presets}
      today={businessDate(new Date(), timeZone)}
      view={view}
      filters={{ group: groupRaw, categoryId: categoryId ?? "" }}
      summary={cashBook.summary}
      days={cashBook.days}
      spend={spend}
      expensePage={expensePage}
      categories={categories}
    />
  );
}
