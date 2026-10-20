import type { PaymentMethod } from "@/constants/payment-methods";

/**
 * Every amount below is RUPEES as an exact decimal string, e.g. "60.50".
 * Never a JavaScript number — see src/lib/utils/money.ts for why.
 */

/** A line as the cart holds it, client-side only. */
export type CartLine = {
  itemId: string;
  name: string;
  unitPrice: string;
  quantity: number;
  /** The most this line may hold: the line limit, or the stock left. */
  maxQuantity: number;
};

/**
 * What the browser sends when saving a bill.
 *
 * Note there is NO price field. The server re-reads every price from the
 * database — if the browser supplied prices, a tampered request could bill ₹1
 * for a ₹200 item. See spec §8.2.
 */
export type CreateBillInput = {
  idempotencyKey: string;
  lines: Array<{ itemId: string; quantity: number }>;
  discount: string;
  paymentMethod: PaymentMethod;
  tendered: string | null;
  /** What the cashier saw on screen. A mismatch aborts with PRICE_CHANGED. */
  expectedTotal: string;
};

export type CreatedBill = {
  id: string;
  billNumber: number;
  businessDate: string;
  total: string;
};

export type ReceiptLine = {
  itemName: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
};

export type ReceiptData = {
  billNumber: number;
  businessDate: string;
  createdAt: Date;
  cashierName: string;
  lines: ReceiptLine[];
  subtotal: string;
  discount: string;
  total: string;
  paymentMethod: PaymentMethod;
  tendered: string | null;
  changeDue: string | null;
  shop: {
    name: string;
    addressLine: string | null;
    phone: string | null;
    receiptFooter: string | null;
    /** Head the receipt with the logo instead of the name as text. */
    showLogo: boolean;
    printerWidth: "MM_80" | "MM_58";
    timezone: string;
  };
};
