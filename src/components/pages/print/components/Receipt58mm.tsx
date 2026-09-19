import type { ReceiptData } from "@/types/bill.types";

import { Receipt80mm } from "./Receipt80mm";

/**
 * Same markup, narrower measure. Kept as its own component so the two layouts
 * can diverge later without touching the caller.
 */
export function Receipt58mm({ receipt }: { receipt: ReceiptData }) {
  return <Receipt80mm receipt={receipt} narrow />;
}
