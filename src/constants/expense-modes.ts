export const EXPENSE_MODES = ["CASH", "UPI", "CARD", "BANK_TRANSFER"] as const;
export type ExpenseMode = (typeof EXPENSE_MODES)[number];

export const EXPENSE_MODE_LABELS: Record<ExpenseMode, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  BANK_TRANSFER: "Bank transfer",
};

/** Every mode except cash. They all add up into "Online". */
export const ONLINE_EXPENSE_MODES = ["UPI", "CARD", "BANK_TRANSFER"] as const;
export type OnlineExpenseMode = (typeof ONLINE_EXPENSE_MODES)[number];
