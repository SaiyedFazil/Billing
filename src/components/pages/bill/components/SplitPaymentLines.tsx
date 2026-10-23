"use client";

import { X } from "lucide-react";

import { MoneyInput } from "@/components/custom/MoneyInput";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import { PAYMENT_METHOD_ICONS } from "@/lib/utils/payment-method-style";

import type { SplitPaymentState } from "../hooks/useSplitPayment";
import { splitStatusText } from "../utils/split-payment";

const STATUS_TONE = {
  warning: "bg-warning-soft text-warning-ink",
  success: "bg-success-soft text-success-ink",
  destructive: "bg-destructive-soft text-destructive-ink",
} as const;

/**
 * One row per method, "the rest" row following the others, and a status line
 * that says what stops the bill being saved. Presentational: the state and
 * the maths are in `useSplitPayment`.
 */
export function SplitPaymentLines({
  split,
  disabled,
}: {
  split: SplitPaymentState;
  disabled: boolean;
}) {
  const status = splitStatusText(split.status);
  const removable = split.lines.length > 2;

  return (
    <div className="space-y-2">
      {split.lines.map((line, index) => {
        const Icon = PAYMENT_METHOD_ICONS[line.method];
        const label = PAYMENT_METHOD_LABELS[line.method];

        return (
          <div key={line.method} className="space-y-1.5">
            <div
              className={cn(
                "flex items-center gap-2 rounded-xl border border-input bg-card pl-3 transition-[box-shadow,border-color] focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15",
                !removable && "pr-3",
              )}
            >
              <span className="flex w-18 shrink-0 items-center gap-1.5 text-[13px] font-semibold">
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                {label}
              </span>
              <span className="text-lg text-muted-foreground">₹</span>
              <MoneyInput
                aria-label={`${label} amount`}
                value={split.fieldValue(line.method)}
                onChange={(value) => split.setAmount(line.method, value)}
                // The first line takes focus when Split is tapped (this field
                // mounts then); "the rest" selects, so typing replaces it.
                autoFocus={index === 0}
                onFocus={
                  line.auto
                    ? (event) => event.currentTarget.select()
                    : undefined
                }
                disabled={disabled}
                className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 text-left font-heading text-lg font-bold focus-visible:ring-0 md:text-lg"
              />
              {line.auto ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                  the rest
                </span>
              ) : null}
              {removable ? (
                <button
                  type="button"
                  aria-label={`Remove ${label}`}
                  disabled={disabled}
                  onClick={() => split.remove(line.method)}
                  className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>

            {line.method === "CASH" ? (
              <div className="flex items-center gap-2 pl-3">
                <label
                  htmlFor="cash-given"
                  className="shrink-0 text-xs font-medium text-muted-foreground"
                >
                  Cash given
                </label>
                <span className="flex min-w-0 flex-1 items-center gap-1 rounded-xl border border-input bg-card px-3 transition-[box-shadow,border-color] focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/15">
                  <span className="text-muted-foreground">₹</span>
                  <MoneyInput
                    id="cash-given"
                    value={split.cashGivenInput}
                    onChange={split.setCashGiven}
                    disabled={disabled}
                    className="h-10 rounded-none border-0 bg-transparent px-0 text-left font-semibold focus-visible:ring-0"
                  />
                </span>
                {split.status.kind === "PAID" &&
                split.status.change !== null ? (
                  <span className="shrink-0 text-sm font-semibold text-success-ink tabular-nums">
                    Change {formatINR(split.status.change)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}

      {split.addable.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {split.addable.map((method) => (
            <button
              key={method}
              type="button"
              disabled={disabled}
              onClick={() => split.add(method)}
              className="h-10 cursor-pointer rounded-full border border-dashed border-input bg-card px-4 text-[13px] font-semibold text-foreground/80 transition-colors hover:border-foreground/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + {PAYMENT_METHOD_LABELS[method]}
            </button>
          ))}
        </div>
      ) : null}

      <div
        aria-live="polite"
        className={cn(
          "flex min-h-10 items-center justify-between gap-3 rounded-xl px-3 py-2 text-[13px] font-semibold",
          STATUS_TONE[status.tone],
        )}
      >
        <span>{status.text}</span>
        {status.detail ? (
          <span className="shrink-0 tabular-nums">{status.detail}</span>
        ) : null}
      </div>
    </div>
  );
}
