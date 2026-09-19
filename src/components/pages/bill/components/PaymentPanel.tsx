"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
import {
  collectsTender,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_ICONS } from "@/lib/utils/payment-method-style";

export function PaymentPanel({
  paymentMethod,
  onPaymentMethodChange,
  tenderedInput,
  onTenderedChange,
  changeDue,
  disabled,
}: {
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  tenderedInput: string;
  onTenderedChange: (value: string) => void;
  changeDue: string | null;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div role="group" aria-label="Payment method" className="grid grid-cols-4 gap-2">
        {PAYMENT_METHODS.map((method) => {
          const Icon = PAYMENT_METHOD_ICONS[method];
          const selected = paymentMethod === method;
          return (
            <button
              key={method}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onPaymentMethodChange(method)}
              className={cn(
                "flex h-15 cursor-pointer flex-col items-center justify-center gap-1 rounded-[14px] border text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? "border-brand bg-brand-soft text-brand-ink ring-brand ring-[0.5px]"
                  : "border-input bg-card text-foreground/80 hover:border-foreground/25",
              )}
            >
              <Icon className="size-5" />
              {PAYMENT_METHOD_LABELS[method]}
            </button>
          );
        })}
      </div>

      {collectsTender(paymentMethod) ? (
        <div className="grid grid-cols-2 gap-2.5">
          <label
            htmlFor="tendered"
            className="border-input bg-card focus-within:border-brand focus-within:ring-brand/15 flex cursor-text flex-col gap-0.5 rounded-xl border px-3 py-2 transition-[box-shadow,border-color] focus-within:ring-4"
          >
            <span className="text-muted-foreground text-xs font-medium">
              Tendered
            </span>
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground text-lg">₹</span>
              <MoneyInput
                id="tendered"
                value={tenderedInput}
                onChange={onTenderedChange}
                disabled={disabled}
                className="font-heading h-7 rounded-none border-0 bg-transparent px-0 text-left text-xl font-bold focus-visible:ring-0 md:text-xl"
              />
            </span>
          </label>

          <div
            aria-live="polite"
            className={cn(
              "flex flex-col gap-0.5 rounded-xl px-3 py-2",
              changeDue === null ? "bg-muted" : "bg-success-soft",
            )}
          >
            <span
              className={cn(
                "text-xs font-medium",
                changeDue === null ? "text-muted-foreground" : "text-success-ink",
              )}
            >
              Change due
            </span>
            <span
              className={cn(
                "font-heading text-xl font-bold tabular-nums",
                changeDue === null ? "text-muted-foreground" : "text-success-ink",
              )}
            >
              {changeDue === null ? "—" : formatINR(changeDue)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
