"use client";

import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatINR, lineTotal } from "@/lib/utils/money";
import type { CartLine as CartLineType } from "@/types/bill.types";

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
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <p className="text-muted-foreground text-xs">
          {formatINR(line.unitPrice)} each
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-7"
          disabled={disabled}
          aria-label={`Decrease ${line.name}`}
          onClick={() => onSetQuantity(line.itemId, line.quantity - 1)}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums">
          {line.quantity}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-7"
          disabled={disabled}
          aria-label={`Increase ${line.name}`}
          onClick={() => onSetQuantity(line.itemId, line.quantity + 1)}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <span className="w-20 text-right text-sm font-semibold tabular-nums">
        {formatINR(lineTotal(line.unitPrice, line.quantity))}
      </span>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="text-muted-foreground size-7"
        disabled={disabled}
        aria-label={`Remove ${line.name}`}
        onClick={() => onRemove(line.itemId)}
      >
        <X className="size-3" />
      </Button>
    </li>
  );
}
