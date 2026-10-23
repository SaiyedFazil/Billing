export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

/**
 * A bill paid by two or more methods. A bill-level label only: never a
 * payment line's method, never a till button, never an enabled method.
 * See the split payment spec §6.1.
 */
export const SPLIT = "SPLIT" as const;

/** What `bills.payment_method` can hold: one real method, or SPLIT. */
export type BillPaymentMethod = PaymentMethod | typeof SPLIT;

export const BILL_PAYMENT_METHODS = [...PAYMENT_METHODS, SPLIT] as const;

export const BILL_PAYMENT_METHOD_LABELS: Record<BillPaymentMethod, string> = {
  ...PAYMENT_METHOD_LABELS,
  SPLIT: "Split",
};

/** Only cash collects a tendered amount and returns change. */
export function collectsTender(method: PaymentMethod): boolean {
  return method === "CASH";
}
