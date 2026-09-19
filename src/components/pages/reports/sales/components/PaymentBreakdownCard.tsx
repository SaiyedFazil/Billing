import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_DOT } from "@/lib/utils/payment-method-style";
import type { PaymentBreakdownRow } from "@/types/report.types";

export function PaymentBreakdownCard({
  payments,
  totalNet,
}: {
  payments: PaymentBreakdownRow[];
  totalNet: string;
}) {
  // Bar widths and percentages are geometry only: these Numbers never feed
  // back into an amount.
  const total = Number(totalNet);
  const share = (net: string) => (total > 0 ? (Number(net) / total) * 100 : 0);

  return (
    <section className="bg-card shadow-card space-y-5 rounded-[20px] border p-6">
      <h2 className="font-heading text-lg font-bold">By payment method</h2>

      <div aria-hidden className="flex h-3.5 gap-0.75 overflow-hidden rounded-full">
        {payments.map((payment) => (
          <span
            key={payment.paymentMethod}
            className={PAYMENT_METHOD_DOT[payment.paymentMethod]}
            style={{ width: `${share(payment.net)}%` }}
          />
        ))}
      </div>

      <ul className="divide-border/70 divide-y">
        {payments.map((payment) => (
          <li
            key={payment.paymentMethod}
            className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span
              aria-hidden
              className={cn(
                "size-2.5 shrink-0 rounded-[3px]",
                PAYMENT_METHOD_DOT[payment.paymentMethod],
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">
                {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
              </p>
              <p className="text-muted-foreground text-xs">
                {payment.billCount} bill{payment.billCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold tabular-nums">
                {formatINR(payment.net)}
              </p>
              <p className="text-muted-foreground text-xs tabular-nums">
                {Math.round(share(payment.net))}%
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
