import {
  Banknote,
  CreditCard,
  type LucideIcon,
  Smartphone,
  Wallet,
} from "lucide-react";

import type { PaymentMethod } from "@/constants/payment-methods";

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
