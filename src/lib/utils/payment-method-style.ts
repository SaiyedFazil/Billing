import {
  Banknote,
  CreditCard,
  type LucideIcon,
  Smartphone,
  Wallet,
} from "lucide-react";

import type { PaymentMethod } from "@/constants/payment-methods";
import type { CashGroup } from "@/lib/utils/cash-book";

export const PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon> = {
  CASH: Banknote,
  UPI: Smartphone,
  CARD: CreditCard,
  OTHER: Wallet,
};

/**
 * One colour per method, used for table dots, the sales breakdown bar and its
 * legend alike. They match --chart-1..4 in globals.css.
 */
export const PAYMENT_METHOD_DOT: Record<PaymentMethod, string> = {
  CASH: "bg-chart-1",
  UPI: "bg-chart-2",
  CARD: "bg-chart-3",
  OTHER: "bg-chart-4",
};

/**
 * The Cash book's cash / online / other dots. These mean the GROUP a rupee
 * belongs to, not a bill's payment method, so they are a separate map — but
 * they reuse the same chart tokens, so cash reads the same colour everywhere.
 */
export const CASH_GROUP_DOT: Record<CashGroup, string> = {
  CASH: "bg-chart-1",
  ONLINE: "bg-chart-2",
  OTHER: "bg-chart-4",
};
