import {
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_DOT } from "@/lib/utils/payment-method-style";

export function PaymentMethodLabel({
  method,
  className,
}: {
  method: PaymentMethod;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span
        aria-hidden
        className={cn("size-2 rounded-full", PAYMENT_METHOD_DOT[method])}
      />
      {PAYMENT_METHOD_LABELS[method]}
    </span>
  );
}
