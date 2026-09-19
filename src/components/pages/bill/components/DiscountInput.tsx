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
          className="text-muted-foreground text-sm font-normal"
        >
          Discount
        </Label>
        <div className="relative w-32">
          <span className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm">
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
        <p className="text-destructive text-right text-xs">
          Discount cannot be more than the subtotal.
        </p>
      ) : null}
    </div>
  );
}
