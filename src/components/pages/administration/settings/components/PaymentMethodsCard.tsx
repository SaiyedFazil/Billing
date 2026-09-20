"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_ICONS } from "@/lib/utils/payment-method-style";

import { usePaymentMethodsCard } from "../hooks/usePaymentMethodsCard";

/** Page-only copy: what each button means to whoever is at the counter. */
const PAYMENT_METHOD_HINTS: Record<PaymentMethod, string> = {
  CASH: "Takes an amount tendered and works out the change.",
  UPI: "GPay, PhonePe, Paytm and any other UPI app.",
  CARD: "Debit and credit cards on the card machine.",
  OTHER: "Anything else — vouchers, credit, a delivery app.",
};

export function PaymentMethodsCard({ initial }: { initial: PaymentMethod[] }) {
  const card = usePaymentMethodsCard(initial);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment methods</CardTitle>
        <CardDescription>
          Only the methods switched on here appear on the New Bill screen.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <ul className="divide-y rounded-2xl border">
          {PAYMENT_METHODS.map((method) => {
            const Icon = PAYMENT_METHOD_ICONS[method];
            const on = card.enabled.includes(method);
            const locked = card.isLastEnabled(method);

            return (
              <li key={method} className="flex items-center gap-3 px-3.5 py-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                    on
                      ? "bg-brand-soft text-brand-ink"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <Icon className="size-4.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`payment-${method}`}
                    className="cursor-pointer text-sm font-semibold"
                  >
                    {PAYMENT_METHOD_LABELS[method]}
                  </label>
                  <p className="text-xs text-pretty text-muted-foreground">
                    {locked
                      ? "The last method on — keep one way to take money."
                      : PAYMENT_METHOD_HINTS[method]}
                  </p>
                </div>

                <Switch
                  id={`payment-${method}`}
                  checked={on}
                  disabled={card.isPending || locked}
                  aria-label={`${PAYMENT_METHOD_LABELS[method]} on the New Bill screen`}
                  onCheckedChange={(next) => card.toggle(method, next)}
                />
              </li>
            );
          })}
        </ul>

        <Button
          type="button"
          className="w-full"
          disabled={card.isPending}
          onClick={card.submit}
        >
          {card.isPending ? "Saving…" : "Save payment methods"}
        </Button>
      </CardContent>
    </Card>
  );
}
