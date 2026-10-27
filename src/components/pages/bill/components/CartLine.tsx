"use client";

import { Minus, Plus, X } from "lucide-react";

import { formatINR, lineTotal } from "@/lib/utils/money";
import type { CartLine as CartLineType } from "@/types/bill.types";

const STEP_BUTTON =
  "bg-card text-foreground flex size-8.5 max-lg:size-10 cursor-pointer items-center justify-center rounded-full shadow-[0_1px_2px_rgb(28_23_20/0.1)] transition-colors hover:bg-background disabled:cursor-not-allowed disabled:opacity-50";

export function CartLine({
  line,
  onSetQuantity,
  onRemove,
  disabled,
}: {
  line: CartLineType;
  onSetQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  disabled: boolean;
}) {
  return (
    <li className="space-y-2 border-b border-border/70 py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-semibold">
          {line.name}
        </p>
        <span className="text-[15px] font-bold tabular-nums">
          {formatINR(lineTotal(line.unitPrice, line.quantity))}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {formatINR(line.unitPrice)} each
        </span>

        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.75">
            <button
              type="button"
              className={STEP_BUTTON}
              disabled={disabled}
              aria-label={`Decrease ${line.name}`}
              onClick={() => onSetQuantity(line.itemId, line.quantity - 1)}
            >
              <Minus className="size-4" strokeWidth={2.25} />
            </button>
            <span className="w-7 text-center text-[15px] font-bold tabular-nums">
              {line.quantity}
            </span>
            <button
              type="button"
              className={STEP_BUTTON}
              disabled={disabled || line.quantity >= line.maxQuantity}
              aria-label={`Increase ${line.name}`}
              onClick={() => onSetQuantity(line.itemId, line.quantity + 1)}
            >
              <Plus className="size-4" strokeWidth={2.25} />
            </button>
          </div>

          <button
            type="button"
            disabled={disabled}
            aria-label={`Remove ${line.name}`}
            onClick={() => onRemove(line.itemId)}
            className="flex size-8.5 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50 max-lg:size-10"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </li>
  );
}
