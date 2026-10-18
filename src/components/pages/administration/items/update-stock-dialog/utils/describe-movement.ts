import type { StockMovementRow } from "@/types/stock.types";

const LABELS = {
  RESTOCK: "Restock",
  WASTAGE: "Wastage",
  CORRECTION: "Count correction",
} as const;

/**
 * How one history row reads in the Update stock dialog.
 *
 * An opening count shows the count itself, not a delta: measured against a
 * count kept from an earlier tracked spell, "+25" would look like a delivery
 * that never happened.
 */
export function describeMovement(row: StockMovementRow): {
  label: string;
  change: string;
  tone: "up" | "down" | "neutral";
} {
  if (row.type === "OPENING") {
    return {
      label: "Opening count",
      change: String(row.quantityAfter),
      tone: "neutral",
    };
  }

  const label =
    row.type === "SALE"
      ? row.billNumber === null
        ? "Sale"
        : `Bill #${row.billNumber}`
      : LABELS[row.type];

  // A true minus sign, so the column of figures lines up.
  return row.quantityDelta > 0
    ? { label, change: `+${row.quantityDelta}`, tone: "up" }
    : { label, change: `−${Math.abs(row.quantityDelta)}`, tone: "down" };
}
