"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

import {
  defaultMonth,
  monthBounds,
  type SpreadsheetPageSize,
} from "@/lib/utils/expense-spreadsheet";
import type { ExpenseMonth } from "@/types/expense.types";

export type SpreadsheetPeriod = "month" | "range";

/**
 * Period, filters, rows per page and page all live in the URL, as on the
 * Cash book, so a reload or a shared link shows the same sheet. Every change
 * except paging goes back to page 1: page 4 of a new selection is meaningless.
 */
export function useExpenseSpreadsheet({
  from,
  months,
}: {
  from: string;
  months: ExpenseMonth[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const push = useCallback(
    (change: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      change(params);
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams],
  );

  const setFilter = useCallback(
    (key: string, value: string) =>
      push((params) => {
        if (value === "" || value === "ALL") params.delete(key);
        else params.set(key, value);
        params.delete("page");
      }),
    [push],
  );

  const setMonth = useCallback(
    (month: string) => {
      const bounds = monthBounds(month);
      if (!bounds) return;
      push((params) => {
        params.set("period", "month");
        params.set("from", bounds.from);
        params.set("to", bounds.to);
        params.delete("page");
      });
    },
    [push],
  );

  /**
   * Month view opens on the month the current range starts in, or the newest
   * month with expenses. Date range view keeps the dates already showing.
   */
  const setPeriod = useCallback(
    (period: string) => {
      if (period === "month") {
        const month = defaultMonth(from, months);
        if (month) setMonth(month);
        return;
      }
      push((params) => {
        params.delete("period");
        params.delete("page");
      });
    },
    [from, months, push, setMonth],
  );

  const setGroup = useCallback(
    (group: string) => setFilter("group", group),
    [setFilter],
  );

  const setCategory = useCallback(
    (categoryId: string) => setFilter("categoryId", categoryId),
    [setFilter],
  );

  const setPageSize = useCallback(
    (size: SpreadsheetPageSize) =>
      push((params) => {
        params.set("rows", String(size));
        params.delete("page");
      }),
    [push],
  );

  const goToPage = useCallback(
    (page: number) => push((params) => params.set("page", String(page))),
    [push],
  );

  return {
    isPending,
    setPeriod,
    setMonth,
    setGroup,
    setCategory,
    setPageSize,
    goToPage,
  };
}
