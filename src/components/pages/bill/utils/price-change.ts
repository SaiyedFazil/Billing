import { billTotal, compare } from "@/lib/utils/money";
import type { CartLine } from "@/types/bill.types";
import type { MenuCategory } from "@/types/item.types";

import { clampLinesToMenu } from "./cart";

/**
 * A PRICE_CHANGED answer the cashier has not yet resolved. `menu` is the menu
 * the till held when the error arrived; a different reference means the
 * refresh that follows it has landed.
 */
export type PendingPriceChange = {
  message: string;
  /** The server's recalculated total, or null if the error did not carry it. */
  newTotal: string | null;
  menu: MenuCategory[];
};

/**
 * - `UPDATING`: the refreshed menu has not arrived yet.
 * - `READY`: the bill on screen now totals exactly what the server wants.
 * - `CHANGED_AGAIN`: it does not (a stock cut, a dropped item, a second price
 *   change), so charging "the new total" would be charging the wrong amount.
 */
export type PriceChangeStep = "UPDATING" | "READY" | "CHANGED_AGAIN";

/**
 * Decides what the price-changed dialog may offer. Works from `menu` directly
 * rather than from the cart, which only catches up in an effect after the
 * render — reading the cart would flash a stale answer for one frame.
 */
export function priceChangeStep(
  pending: PendingPriceChange,
  menu: MenuCategory[],
  lines: CartLine[],
  discount: string,
): PriceChangeStep {
  if (menu === pending.menu) return "UPDATING";
  if (pending.newTotal === null) return "CHANGED_AGAIN";

  const synced = clampLinesToMenu(lines, menu);
  if (synced.changed.length > 0) return "CHANGED_AGAIN";

  const { total } = billTotal(synced.lines, discount);
  return compare(total, pending.newTotal) === 0 ? "READY" : "CHANGED_AGAIN";
}
