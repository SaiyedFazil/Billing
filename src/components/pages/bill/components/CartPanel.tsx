"use client";

import {
  AlertCircle,
  Loader2,
  Printer,
  ReceiptText,
  ShoppingBag,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { PaymentMethod } from "@/constants/payment-methods";
import { formatINR } from "@/lib/utils/money";
import type { CartLine as CartLineType } from "@/types/bill.types";

import { CartLine } from "./CartLine";
import { DiscountInput } from "./DiscountInput";
import { PaymentPanel } from "./PaymentPanel";

export function CartPanel({
  lines,
  itemCount,
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
  itemCount: number;
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
    <aside
      aria-label="Current bill"
      className="relative flex min-h-0 flex-col overflow-hidden rounded-3xl border bg-card shadow-lift lg:h-full"
    >
      <header className="flex items-center gap-3 px-5 pt-5 pb-2">
        <span className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-primary">
          <ReceiptText className="size-5" />
        </span>
        <div>
          <h2 className="font-heading text-xl leading-tight font-bold">
            Current bill
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {itemCount === 0
              ? "No items yet"
              : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
          </p>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1 px-5">
        {lines.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <ShoppingBag className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              Tap an item to start the bill.
            </p>
          </div>
        ) : (
          <ul>
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

      {/* The ticket stub: a perforated edge with a notch cut from each side. */}
      <div className="relative space-y-3.5 border-t-2 border-dashed border-[#e6ded3] bg-[#fffcf9] px-5 pt-5 pb-5">
        <span
          aria-hidden
          className="absolute -top-3 -left-3 size-6 rounded-full border bg-background"
        />
        <span
          aria-hidden
          className="absolute -top-3 -right-3 size-6 rounded-full border bg-background"
        />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-semibold tabular-nums">
            {formatINR(subtotal)}
          </span>
        </div>

        <DiscountInput
          value={discountInput}
          onChange={onDiscountChange}
          invalid={discountExceedsSubtotal}
          disabled={isSaving}
        />

        <div className="flex items-end justify-between border-t pt-3">
          <span className="pb-1 text-[15px] font-semibold text-foreground/80">
            Total
          </span>
          <span className="font-heading text-[38px] leading-none font-extrabold tracking-tight tabular-nums">
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
            className="space-y-2 rounded-xl bg-destructive-soft p-3"
          >
            <p className="flex gap-2 text-sm font-medium text-destructive-ink">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
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
          className="h-15 w-full rounded-2xl text-[17px]"
          disabled={!canSave}
          onClick={onSave}
        >
          {isSaving ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Printer className="size-5" />
              Save &amp; Print
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
