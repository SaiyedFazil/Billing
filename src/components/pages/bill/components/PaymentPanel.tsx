"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  collectsTender,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { formatINR } from "@/lib/utils/money";

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
      <div className="grid grid-cols-4 gap-2">
        {PAYMENT_METHODS.map((method) => (
          <Button
            key={method}
            type="button"
            size="sm"
            variant={paymentMethod === method ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onPaymentMethodChange(method)}
          >
            {PAYMENT_METHOD_LABELS[method]}
          </Button>
        ))}
      </div>

      {collectsTender(paymentMethod) ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="tendered" className="text-sm font-normal">
              Tendered ₹
            </Label>
            <MoneyInput
              id="tendered"
              value={tenderedInput}
              onChange={onTenderedChange}
              disabled={disabled}
              className="w-28"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Change</span>
            <span className="font-semibold tabular-nums">
              {changeDue === null ? "—" : formatINR(changeDue)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
