import { compare } from "@/lib/utils/money";
import { maxSellable, sellability } from "@/lib/utils/stock";
import type { CartLine } from "@/types/bill.types";
import type { MenuCategory, MenuItem } from "@/types/item.types";

/** True when the bill already holds every unit of a tracked item. */
export function atStockCap(item: MenuItem, inCart: number): boolean {
  return item.trackStock && inCart >= maxSellable(item);
}

/**
 * Brings a cart in line with a freshly loaded menu: each line's cap is taken
 * from the current stock, a line above it is cut down, and a line whose item
 * can no longer be sold is dropped. Without this, a cashier whose save failed
 * on stock would re-submit the same doomed bill.
 *
 * Every kept line also takes the menu's price, so a price the owner changed
 * while the bill was open shows on screen and in the total.
 *
 * `changed` names the lines whose quantity was cut or that were dropped;
 * `repriced` names the kept lines whose price moved. A dropped line is only
 * ever in `changed`.
 */
export function clampLinesToMenu(
  lines: CartLine[],
  menu: MenuCategory[],
): { lines: CartLine[]; changed: string[]; repriced: string[] } {
  const byId = new Map(
    menu.flatMap((category) => category.items).map((item) => [item.id, item]),
  );
  const changed: string[] = [];
  const repriced: string[] = [];
  const next: CartLine[] = [];

  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item || sellability(item) !== "SELLABLE") {
      changed.push(line.name);
      continue;
    }
    const maxQuantity = maxSellable(item);
    const quantity = Math.min(line.quantity, maxQuantity);
    if (quantity !== line.quantity) changed.push(line.name);
    if (compare(line.unitPrice, item.price) !== 0) repriced.push(line.name);
    next.push({ ...line, unitPrice: item.price, quantity, maxQuantity });
  }

  return { lines: next, changed, repriced };
}

/** Items visible in the grid for the current tab and search term. */
export function filterItems(
  categories: MenuCategory[],
  activeCategoryId: string | null,
  search: string,
): MenuItem[] {
  const scoped =
    activeCategoryId === null
      ? categories.flatMap((category) => category.items)
      : (categories.find((c) => c.id === activeCategoryId)?.items ?? []);

  const term = search.trim().toLowerCase();
  if (!term) return scoped;

  return scoped.filter((item) => item.name.toLowerCase().includes(term));
}

/**
 * The item a bare Enter in the search box should add.
 *
 * Searches the WHOLE menu rather than the active category, so the cashier does
 * not have to think about tabs while typing. Prefix matches win over substring
 * matches, and sold-out or out-of-stock items are never auto-added.
 */
export function topSearchMatch(
  categories: MenuCategory[],
  search: string,
): MenuItem | null {
  const term = search.trim().toLowerCase();
  if (!term) return null;

  const all = categories
    .flatMap((category) => category.items)
    .filter((item) => sellability(item) === "SELLABLE");

  const startsWith = all.find((item) =>
    item.name.toLowerCase().startsWith(term),
  );
  if (startsWith) return startsWith;

  return all.find((item) => item.name.toLowerCase().includes(term)) ?? null;
}
