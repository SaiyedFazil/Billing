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
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="discount" className="text-sm font-normal">
          Discount ₹
        </Label>
        <MoneyInput
          id="discount"
          value={value}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
          className="w-28"
        />
      </div>
      {invalid ? (
        <p className="text-destructive text-right text-xs">
          Discount cannot be more than the subtotal.
        </p>
      ) : null}
    </div>
  );
}
