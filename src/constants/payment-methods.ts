export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

/** Only cash collects a tendered amount and returns change. */
export function collectsTender(method: PaymentMethod): boolean {
  return method === "CASH";
}
