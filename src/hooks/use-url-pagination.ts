"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Pagination state lives in the URL so a page of the bills ledger can be
 * bookmarked and shared — which matters when the accountant asks for "that
 * screen you showed me".
 */
export function useUrlPagination() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.max(
    1,
    Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) ||
      DEFAULT_PAGE_SIZE,
  );

  const push = useCallback(
    (next: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) params.set(key, value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const setPage = useCallback(
    (next: number) => push({ page: String(next) }),
    [push],
  );

  const setPageSize = useCallback(
    (next: number) => push({ pageSize: String(next), page: "1" }),
    [push],
  );

  return { page, pageSize, setPage, setPageSize };
}
