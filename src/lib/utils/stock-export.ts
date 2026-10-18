import { toCsv } from "./csv";

export type StockMovementExportRow = {
  createdAt: Date;
  itemName: string;
  type: string;
  quantityDelta: number;
  quantityAfter: number;
  billNumber: number | null;
  createdByName: string;
  note: string | null;
};

/** The stock history file in the owner's backup export. */
export function stockMovementsCsv(rows: StockMovementExportRow[]): string {
  return toCsv(rows, [
    { header: "Date", value: (r) => r.createdAt.toISOString() },
    { header: "Item", value: (r) => r.itemName },
    { header: "Type", value: (r) => r.type },
    { header: "Change", value: (r) => r.quantityDelta },
    { header: "After", value: (r) => r.quantityAfter },
    { header: "Bill No", value: (r) => r.billNumber ?? "" },
    { header: "By", value: (r) => r.createdByName },
    { header: "Note", value: (r) => r.note ?? "" },
  ]);
}
