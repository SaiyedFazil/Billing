import { ExpenseSpreadsheetTab } from "@/components/pages/administration/cash-book/spreadsheet/ExpenseSpreadsheetTab";
import { requireSuperadmin } from "@/lib/auth/guard";
import { parseExpenseListParams } from "@/lib/utils/expense-list-params";
import { parsePageSize } from "@/lib/utils/expense-spreadsheet";
import { resolveReportRange } from "@/lib/utils/report-params";
import {
  getExpenseTotal,
  listActiveExpenseCategories,
  listExpenseMonths,
  listExpenses,
} from "@/server/expenses/expenses-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Expenses spreadsheet",
  description: "Every expense in a period, laid out for audit.",
};

export default async function Page({
  searchParams,
}: PageProps<"/administration/cash-book/spreadsheet">) {
  // The layout gate is NOT enough: Next renders layout and page in parallel,
  // so without this the page would stream the owner's expenses to a cashier
  // before the layout's guard threw. See CLAUDE.md non-negotiable 2.
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

  const period = read("period") === "month" ? "month" : "range";
  const { group, groupParam, categoryId, page } = parseExpenseListParams(read);
  const pageSize = parsePageSize(read("rows"));
  const filters = { from, to, group, categoryId };

  // Read-only: the same list query as the Cash book, plus a total and the
  // months that have data. Nothing on this page writes.
  const [expensePage, total, months, categories] = await Promise.all([
    listExpenses(filters, page, pageSize),
    getExpenseTotal(filters),
    listExpenseMonths(),
    listActiveExpenseCategories(),
  ]);

  return (
    <ExpenseSpreadsheetTab
      from={from}
      to={to}
      presets={presets}
      period={period}
      filters={{ group: groupParam, categoryId: categoryId ?? "" }}
      pageSize={pageSize}
      expensePage={expensePage}
      total={total}
      months={months}
      categories={categories}
      timeZone={timeZone}
    />
  );
}
