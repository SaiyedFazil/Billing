/** Mirrors the stock_movement_type enum in src/db/schema/enums.ts. */
export type StockMovementType =
  "OPENING" | "RESTOCK" | "SALE" | "WASTAGE" | "CORRECTION";

/** One line of an item's stock history, as the Update stock dialog lists it. */
export type StockMovementRow = {
  id: string;
  type: StockMovementType;
  /** Signed whole units: +24 restock, -2 sale. */
  quantityDelta: number;
  quantityAfter: number;
  note: string | null;
  /** ISO timestamp — crosses the server-action boundary as a string. */
  createdAt: string;
  createdByName: string;
  /** Set for SALE rows only. */
  billNumber: number | null;
};

export type StockAlertRow = {
  id: string;
  name: string;
  categoryName: string;
  imageUrl: string | null;
  stockQuantity: number;
  lowStockThreshold: number;
};

/** The Dashboard card's data. Counts cover every tracked item. */
export type StockAlerts = {
  trackedCount: number;
  low: number;
  out: number;
  /** Out of stock first, then the lowest counts. At most 6. */
  items: StockAlertRow[];
};
