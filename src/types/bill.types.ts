import type {
  BillPaymentMethod,
  PaymentMethod,
} from "@/constants/payment-methods";
import type { SplitPaymentInput } from "@/lib/utils/bill-payments";

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
  paymentMethod: BillPaymentMethod;
  tendered: string | null;
  /** The lines of a SPLIT bill. Absent for a one-method bill. */
  splitPayments?: SplitPaymentInput[] | null;
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

/** One payment line of a bill, as the receipt and bill details show it. */
export type ReceiptPayment = {
  method: PaymentMethod;
  amount: string;
  /** Cash handed over: the cash line only. */
  tendered: string | null;
  changeDue: string | null;
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
  /** The bill's label: one method, or SPLIT. */
  paymentMethod: BillPaymentMethod;
  tendered: string | null;
  changeDue: string | null;
  /** The bill's payment lines, ordered by position. */
  payments: ReceiptPayment[];
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
