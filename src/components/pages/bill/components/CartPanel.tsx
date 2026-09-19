"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { PaymentMethod } from "@/constants/payment-methods";
import { formatINR } from "@/lib/utils/money";
import type { CartLine as CartLineType } from "@/types/bill.types";

import { CartLine } from "./CartLine";
import { DiscountInput } from "./DiscountInput";
import { PaymentPanel } from "./PaymentPanel";

export function CartPanel({
  lines,
  onSetQuantity,
  onRemove,
  subtotal,
  discountInput,
  onDiscountChange,
  discountExceedsSubtotal,
  total,
  paymentMethod,
  onPaymentMethodChange,
  tenderedInput,
  onTenderedChange,
  changeDue,
  canSave,
  isSaving,
  error,
  onSave,
}: {
  lines: CartLineType[];
  onSetQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  subtotal: string;
  discountInput: string;
  onDiscountChange: (value: string) => void;
  discountExceedsSubtotal: boolean;
  total: string;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  tenderedInput: string;
  onTenderedChange: (value: string) => void;
  changeDue: string | null;
  canSave: boolean;
  isSaving: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <aside className="bg-card flex h-full min-h-0 flex-col rounded-lg border">
      <header className="border-b px-4 py-3">
        <h2 className="font-semibold">Current bill</h2>
      </header>

      <ScrollArea className="min-h-0 flex-1 px-4">
        {lines.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            Tap an item to start the bill.
          </p>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => (
              <CartLine
                key={line.itemId}
                line={line}
                onSetQuantity={onSetQuantity}
                onRemove={onRemove}
                disabled={isSaving}
              />
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="space-y-3 border-t px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular-nums">{formatINR(subtotal)}</span>
        </div>

        <DiscountInput
          value={discountInput}
          onChange={onDiscountChange}
          invalid={discountExceedsSubtotal}
          disabled={isSaving}
        />

        <Separator />

        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-2xl font-bold tabular-nums">
            {formatINR(total)}
          </span>
        </div>

        <PaymentPanel
          paymentMethod={paymentMethod}
          onPaymentMethodChange={onPaymentMethodChange}
          tenderedInput={tenderedInput}
          onTenderedChange={onTenderedChange}
          changeDue={changeDue}
          disabled={isSaving}
        />

        {error ? (
          <div
            role="alert"
            className="bg-destructive/10 space-y-2 rounded-md px-3 py-2"
          >
            <p className="text-destructive text-sm">{error}</p>
            {/* Retry reuses the same idempotency key, so pressing it after a
                timeout cannot create a second bill. See spec §11.2. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onSave}
              disabled={isSaving}
            >
              Retry
            </Button>
          </div>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-base"
          disabled={!canSave}
          onClick={onSave}
        >
          {isSaving ? "Saving…" : "Save & Print"}
        </Button>
      </div>
    </aside>
  );
}
