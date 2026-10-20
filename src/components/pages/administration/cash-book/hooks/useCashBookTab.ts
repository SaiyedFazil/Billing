"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useTransition } from "react";

export type CashBookView = "expenses" | "days";

/**
 * Filters and page live in the URL, like the Bills ledger, so a reload or a
 * shared link shows the same screen.
 *
 * The tab is local state mirrored into the URL with replaceState: the page
 * already fetched both tabs, so switching needs no server round trip.
 */
export function useCashBookTab(initialView: CashBookView) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [view, setViewState] = useState<CashBookView>(initialView);

  const push = useCallback(
    (change: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      change(params);
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams],
  );

  /** A filter change resets to page 1 — page 4 of a new filter is meaningless. */
  const setFilter = useCallback(
    (key: string, value: string) =>
      push((params) => {
        if (value === "" || value === "ALL") params.delete(key);
        else params.set(key, value);
        params.delete("page");
      }),
    [push],
  );

  const setView = useCallback((next: string) => {
    const nextView: CashBookView = next === "days" ? "days" : "expenses";
    setViewState(nextView);
    const url = new URL(window.location.href);
    if (nextView === "days") url.searchParams.set("view", "days");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  }, []);

  const setGroup = useCallback(
    (group: string) => setFilter("group", group),
    [setFilter],
  );

  const setCategory = useCallback(
    (categoryId: string) => setFilter("categoryId", categoryId),
    [setFilter],
  );

  const goToPage = useCallback(
    (page: number) => push((params) => params.set("page", String(page))),
    [push],
  );

  return { isPending, view, setView, setGroup, setCategory, goToPage };
}
