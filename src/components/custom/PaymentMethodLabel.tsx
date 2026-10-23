import {
  BILL_PAYMENT_METHOD_LABELS,
  type BillPaymentMethod,
  SPLIT,
} from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_DOT } from "@/lib/utils/payment-method-style";

export function PaymentMethodLabel({
  method,
  className,
}: {
  method: BillPaymentMethod;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          // A split bill has no colour of its own; its lines carry the methods.
          method === SPLIT ? "bg-muted-foreground" : PAYMENT_METHOD_DOT[method],
        )}
      />
      {BILL_PAYMENT_METHOD_LABELS[method]}
    </span>
  );
}
