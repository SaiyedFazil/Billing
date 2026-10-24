import type { ExpenseMonth } from "@/types/expense.types";

/**
 * Pure helpers for the Cash book's read-only spreadsheet view. No server
 * imports: the page and its client components both use them.
 */

export const SPREADSHEET_PAGE_SIZES = [25, 50, 100] as const;
export type SpreadsheetPageSize = (typeof SPREADSHEET_PAGE_SIZES)[number];
export const DEFAULT_SPREADSHEET_PAGE_SIZE: SpreadsheetPageSize = 25;

/** `?rows=` from the URL. Anything but 25, 50 or 100 falls back to 25. */
export function parsePageSize(raw: string): SpreadsheetPageSize {
  return (
    SPREADSHEET_PAGE_SIZES.find((size) => String(size) === raw) ??
    DEFAULT_SPREADSHEET_PAGE_SIZE
  );
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * "2026-02" -> { from: "2026-02-01", to: "2026-02-28" }. Plain calendar
 * arithmetic at UTC, so no timezone can shift a boundary. Null when invalid.
 */
export function monthBounds(
  month: string,
): { from: string; to: string } | null {
  const match = MONTH_PATTERN.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]);
  // Day 0 of the next month is the last day of this one.
  const lastDay = new Date(Date.UTC(year, monthIndex, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

/** The month a range covers exactly ("2026-10-01".."2026-10-31"), or null. */
export function monthOfRange(from: string, to: string): string | null {
  const month = from.slice(0, 7);
  const bounds = monthBounds(month);
  return bounds && bounds.from === from && bounds.to === to ? month : null;
}

/** "2026-10" -> "October 2026". */
export function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return `${MONTH_NAMES[Number(monthNumber) - 1]} ${year}`;
}

/** Months (newest first) grouped under their year, keeping that order. */
export function groupMonthsByYear(
  months: ExpenseMonth[],
): Array<{ year: string; months: ExpenseMonth[] }> {
  const groups: Array<{ year: string; months: ExpenseMonth[] }> = [];
  for (const entry of months) {
    const year = entry.month.slice(0, 4);
    const last = groups.at(-1);
    if (last?.year === year) last.months.push(entry);
    else groups.push({ year, months: [entry] });
  }
  return groups;
}

/**
 * The month to show when the owner switches to month view: the month the
 * current range starts in if it has expenses, otherwise the newest one.
 */
export function defaultMonth(
  from: string,
  months: ExpenseMonth[],
): string | null {
  const current = from.slice(0, 7);
  return months.some((entry) => entry.month === current)
    ? current
    : (months[0]?.month ?? null);
}

/** "2026-10-20" -> "20-10-2026", the compact date the grid shows. */
export function formatSheetDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

/** The filters both pages share, as they appear in the URL. */
export type ExpenseLinkParams = {
  from: string;
  to: string;
  /** The raw `?group=` value: "cash", "online" or "". */
  group: string;
  categoryId: string;
};

/**
 * A link between the Cash book and its spreadsheet that keeps the range and
 * filters, in either direction. Paging and rows per page are not carried.
 */
export function expenseListHref(
  path: string,
  params: ExpenseLinkParams,
): string {
  const query = new URLSearchParams({ from: params.from, to: params.to });
  if (params.group) query.set("group", params.group);
  if (params.categoryId) query.set("categoryId", params.categoryId);
  return `${path}?${query.toString()}`;
}
