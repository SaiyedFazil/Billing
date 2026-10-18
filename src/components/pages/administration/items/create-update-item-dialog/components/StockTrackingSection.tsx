"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import type { ItemFormState } from "../../hooks/useItemsTab";

/** Keeps a whole-number field to digits only, up to 99,999. */
function digitsOnly(value: string): boolean {
  return value === "" || /^\d{0,5}$/.test(value);
}

/**
 * Turns stock tracking on or off and sets the low-stock level. The count is
 * only entered here when tracking starts; after that it changes through
 * Update stock and sales, so every change has a history row.
 */
export function StockTrackingSection({
  form,
  setForm,
  fieldErrors,
  disabled,
}: {
  form: ItemFormState;
  setForm: (next: ItemFormState) => void;
  fieldErrors: Record<string, string>;
  disabled: boolean;
}) {
  return (
    <section className="space-y-4 rounded-2xl border bg-background/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor="item-track-stock">Track stock</Label>
          <p className="text-[13px] text-muted-foreground">
            Count units and stop selling at zero.
          </p>
        </div>
        <Switch
          id="item-track-stock"
          checked={form.trackStock}
          disabled={disabled}
          onCheckedChange={(checked) =>
            setForm({ ...form, trackStock: checked })
          }
        />
      </div>

      {form.trackStock ? (
        <div className="grid grid-cols-2 gap-4">
          {form.wasTracked ? (
            <div className="space-y-2">
              <span className="text-sm leading-none font-medium">In stock</span>
              <p className="flex h-10 items-center font-heading text-lg font-bold tabular-nums">
                {form.stockQuantity}
              </p>
              <p className="text-xs text-muted-foreground">
                Change it with Update stock.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="item-opening-stock">Opening stock</Label>
              <Input
                id="item-opening-stock"
                inputMode="numeric"
                placeholder="On the shelf now"
                value={form.openingStockInput}
                disabled={disabled}
                aria-invalid={Boolean(fieldErrors.openingStock)}
                onChange={(event) => {
                  if (digitsOnly(event.target.value)) {
                    setForm({ ...form, openingStockInput: event.target.value });
                  }
                }}
              />
              {fieldErrors.openingStock ? (
                <p className="text-sm text-destructive">
                  {fieldErrors.openingStock}
                </p>
              ) : null}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="item-low-stock">Low-stock alert at</Label>
            <Input
              id="item-low-stock"
              inputMode="numeric"
              value={form.lowStockInput}
              disabled={disabled}
              aria-invalid={Boolean(fieldErrors.lowStockThreshold)}
              onChange={(event) => {
                if (digitsOnly(event.target.value)) {
                  setForm({ ...form, lowStockInput: event.target.value });
                }
              }}
            />
            {fieldErrors.lowStockThreshold ? (
              <p className="text-sm text-destructive">
                {fieldErrors.lowStockThreshold}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                0 turns the warning off.
              </p>
            )}
          </div>
        </div>
      ) : form.wasTracked ? (
        <p className="text-[13px] text-muted-foreground">
          The count and its history are kept. Turning tracking back on asks for
          a fresh count.
        </p>
      ) : null}
    </section>
  );
}
