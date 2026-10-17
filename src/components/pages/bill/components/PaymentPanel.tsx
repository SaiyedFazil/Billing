"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
import {
  collectsTender,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_ICONS } from "@/lib/utils/payment-method-style";

/**
 * Written out in full because Tailwind scans for literal class names — a
 * template string like `grid-cols-${n}` produces no CSS.
 */
const GRID_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
};

export function PaymentPanel({
  paymentMethods,
  paymentMethod,
  onPaymentMethodChange,
  tenderedInput,
  onTenderedChange,
  changeDue,
  disabled,
}: {
  paymentMethods: PaymentMethod[];
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  tenderedInput: string;
  onTenderedChange: (value: string) => void;
  changeDue: string | null;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label="Payment method"
        className={cn(
          "grid gap-2",
          GRID_COLUMNS[paymentMethods.length] ?? "grid-cols-4",
        )}
      >
        {paymentMethods.map((method) => {
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
                  ? "border-brand bg-brand-soft text-brand-ink ring-[0.5px] ring-brand"
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
            className="flex cursor-text flex-col gap-0.5 rounded-xl border border-input bg-card px-3 py-2 transition-[box-shadow,border-color] focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15"
          >
            <span className="text-xs font-medium text-muted-foreground">
              Tendered
            </span>
            <span className="flex items-center gap-1">
              <span className="text-lg text-muted-foreground">₹</span>
              <MoneyInput
                id="tendered"
                value={tenderedInput}
                onChange={onTenderedChange}
                disabled={disabled}
                className="h-7 rounded-none border-0 bg-transparent px-0 text-left font-heading text-xl font-bold focus-visible:ring-0 md:text-xl"
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
                changeDue === null
                  ? "text-muted-foreground"
                  : "text-success-ink",
              )}
            >
              Change due
            </span>
            <span
              className={cn(
                "font-heading text-xl font-bold tabular-nums",
                changeDue === null
                  ? "text-muted-foreground"
                  : "text-success-ink",
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
