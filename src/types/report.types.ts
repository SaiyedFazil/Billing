import type {
  BillPaymentMethod,
  PaymentMethod,
} from "@/constants/payment-methods";

/**
 * Every money field below is RUPEES as an exact decimal string, e.g. "140.00".
 * Counts (billCount, quantity, page totals) are genuine numbers.
 */

export type DashboardStats = {
  businessDate: string;
  billCount: number;
  gross: string;
  discount: string;
  net: string;
  averageBill: string;
  topItemName: string | null;
  topItemQuantity: number;
};

export type SalesByDayRow = {
  businessDate: string;
  billCount: number;
  gross: string;
  discount: string;
  net: string;
};

export type PaymentBreakdownRow = {
  paymentMethod: PaymentMethod;
  billCount: number;
  net: string;
};

export type ItemSalesRow = {
  itemName: string;
  categoryName: string;
  quantity: number;
  revenue: string;
  /** Share of total revenue in the range, 0-100, one decimal. Not money. */
  sharePercent: number;
};

export type BillLedgerRow = {
  id: string;
  billNumber: number;
  businessDate: string;
  createdAt: Date;
  /** Rupees, e.g. "140.00". */
  total: string;
  /** The bill's label: one method, or SPLIT. */
  paymentMethod: BillPaymentMethod;
  status: "COMPLETED" | "VOID";
  cashierName: string;
  lineCount: number;
  /** A SPLIT bill's lines in position order; null for a one-method bill. */
  splitPayments: Array<{ method: PaymentMethod; amount: string }> | null;
};

export type BillLedgerFilters = {
  from: string;
  to: string;
  cashierId?: string;
  paymentMethod?: BillPaymentMethod;
  billNumber?: number;
};

export type BillLedgerPage = {
  rows: BillLedgerRow[];
  /** Total matching ROWS, not an amount. */
  total: number;
  page: number;
  pageSize: number;
};
