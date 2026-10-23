import {
  BILL_PAYMENT_METHOD_LABELS,
  type BillPaymentMethod,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  SPLIT,
} from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_DOT } from "@/lib/utils/payment-method-style";

export function PaymentMethodLabel({
  method,
  splitPayments,
  className,
}: {
  method: BillPaymentMethod;
  /**
   * A split bill's lines in position order. When given, the label shows one
   * dot per method and lists the amounts on hover.
   */
  splitPayments?: Array<{ method: PaymentMethod; amount: string }> | null;
  className?: string;
}) {
  if (method === SPLIT && splitPayments && splitPayments.length > 0) {
    return (
      <span
        title={splitPayments
          .map(
            (part) =>
              `${PAYMENT_METHOD_LABELS[part.method]} ${formatINR(part.amount)}`,
          )
          .join(" · ")}
        className={cn("inline-flex items-center gap-2", className)}
      >
        {BILL_PAYMENT_METHOD_LABELS[SPLIT]}
        <span aria-hidden className="inline-flex items-center gap-1">
          {splitPayments.map((part) => (
            <span
              key={part.method}
              className={cn(
                "size-2 rounded-full",
                PAYMENT_METHOD_DOT[part.method],
              )}
            />
          ))}
        </span>
      </span>
    );
  }

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
