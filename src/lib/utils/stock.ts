import { MAX_LINE_QUANTITY } from "@/lib/validation/bill-schema";

/**
 * Stock rules shared by the server, the till and the admin screens, so every
 * surface agrees on what "Low" or "Out of stock" means. Stock is whole units,
 * so a plain integer is correct here — the decimal-string rule is for money.
 *
 * Must stay free of server imports: the till bundles this file.
 */

export const MAX_STOCK = 99_999;
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export type StockLevel = {
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
};

export type StockStatus = "UNTRACKED" | "IN_STOCK" | "LOW" | "OUT";

export function stockStatus(level: StockLevel): StockStatus {
  if (!level.trackStock) return "UNTRACKED";
  if (level.stockQuantity === 0) return "OUT";
  if (level.stockQuantity <= level.lowStockThreshold) return "LOW";
  return "IN_STOCK";
}

export type Sellability = "SELLABLE" | "SOLD_OUT" | "OUT_OF_STOCK";

/**
 * The owner's manual Sold out switch wins over a zero count, so the till shows
 * the reason the owner chose rather than the automatic one.
 */
export function sellability(
  item: StockLevel & { isAvailable: boolean },
): Sellability {
  if (!item.isAvailable) return "SOLD_OUT";
  if (item.trackStock && item.stockQuantity === 0) return "OUT_OF_STOCK";
  return "SELLABLE";
}

/** The most of one item a single bill may carry. */
export function maxSellable(level: StockLevel): number {
  return level.trackStock
    ? Math.min(MAX_LINE_QUANTITY, level.stockQuantity)
    : MAX_LINE_QUANTITY;
}

/** A whole number from a form field, or null for anything else. */
export function parseWholeQuantity(input: string): number | null {
  const value = input.trim();
  if (!/^\d+$/.test(value)) return null;
  const quantity = Number(value);
  return quantity <= MAX_STOCK ? quantity : null;
}

export type AdjustMode = "ADD" | "REMOVE" | "SET";
export type AdjustReason = "RESTOCK" | "WASTAGE" | "CORRECTION";

export const ADJUST_MODES = ["ADD", "REMOVE", "SET"] as const;
export const ADJUST_REASONS = ["RESTOCK", "WASTAGE", "CORRECTION"] as const;

export const REASONS_FOR_MODE: Record<AdjustMode, AdjustReason[]> = {
  ADD: ["RESTOCK"],
  REMOVE: ["WASTAGE", "CORRECTION"],
  // Setting an exact count is a physical stock-take.
  SET: ["CORRECTION"],
};

export type AdjustmentPlan =
  { ok: true; after: number; delta: number } | { ok: false; message: string };

/**
 * What an adjustment would do to `current`. Used by the dialog's preview and
 * again by the server against the locked row, so both apply the same rules.
 */
export function planAdjustment(
  current: number,
  mode: AdjustMode,
  quantity: number,
): AdjustmentPlan {
  const after =
    mode === "ADD"
      ? current + quantity
      : mode === "REMOVE"
        ? current - quantity
        : quantity;

  if (after < 0) return { ok: false, message: `Only ${current} in stock` };
  if (after > MAX_STOCK) {
    return {
      ok: false,
      message: `Stock can't go above ${MAX_STOCK.toLocaleString("en-IN")}`,
    };
  }
  if (after === current) {
    return { ok: false, message: "That's already the count" };
  }
  return { ok: true, after, delta: after - current };
}
