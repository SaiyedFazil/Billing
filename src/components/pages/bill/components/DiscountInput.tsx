"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
import { Label } from "@/components/ui/label";

export function DiscountInput({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <Label
          htmlFor="discount"
          className="text-sm font-normal text-muted-foreground"
        >
          Discount
        </Label>
        <div className="relative w-32">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
            ₹
          </span>
          <MoneyInput
            id="discount"
            value={value}
            onChange={onChange}
            invalid={invalid}
            disabled={disabled}
            className="pl-7 font-semibold"
          />
        </div>
      </div>
      {invalid ? (
        <p className="text-right text-xs text-destructive">
          Discount cannot be more than the subtotal.
        </p>
      ) : null}
    </div>
  );
}
