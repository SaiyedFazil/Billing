import { z } from "zod";

/**
 * The expense list's filters and page from the URL, shared by the Cash book
 * and its spreadsheet. A hand-edited URL falls back to the defaults rather
 * than failing.
 */
export function parseExpenseListParams(read: (key: string) => string): {
  group: "CASH" | "ONLINE" | undefined;
  /** The raw `?group=` value, echoed back to the filter control. */
  groupParam: string;
  categoryId: string | undefined;
  page: number;
} {
  const groupParam = read("group");
  const group =
    groupParam === "cash"
      ? "CASH"
      : groupParam === "online"
        ? "ONLINE"
        : undefined;
  const categoryRaw = read("categoryId");
  const categoryId = z.uuid().safeParse(categoryRaw).success
    ? categoryRaw
    : undefined;
  const page = Math.max(1, Number(read("page")) || 1);
  return { group, groupParam, categoryId, page };
}
