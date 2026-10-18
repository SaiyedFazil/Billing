"use client";

import { ArrowRight } from "lucide-react";

import { StockBadge } from "@/components/custom/StockBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AdjustMode, AdjustReason } from "@/lib/utils/stock";
import type { AdminItemRow } from "@/types/item.types";

import { StockHistoryList } from "./components/StockHistoryList";
import { useUpdateStockDialog } from "./hooks/useUpdateStockDialog";

const MODES: Array<{ value: AdjustMode; label: string; hint: string }> = [
  { value: "ADD", label: "Add stock", hint: "Units delivered" },
  { value: "REMOVE", label: "Remove stock", hint: "Units to take off" },
  { value: "SET", label: "Set count", hint: "Units on the shelf now" },
];

const REASON_LABELS: Record<AdjustReason, string> = {
  RESTOCK: "Restock",
  WASTAGE: "Damaged or expired",
  CORRECTION: "Count correction",
};

const NOTE_LIMIT = 200;

/** Opens for one tracked item; `item = null` closes it. */
export function UpdateStockDialog({
  item,
  onClose,
}: {
  item: AdminItemRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {/* Keyed so every opening starts with a clean form. */}
        {item ? (
          <UpdateStockForm key={item.id} item={item} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function UpdateStockForm({
  item,
  onClose,
}: {
  item: AdminItemRow;
  onClose: () => void;
}) {
  const dialog = useUpdateStockDialog({ item, onClose });
  const hint = MODES.find((mode) => mode.value === dialog.mode)!.hint;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Update stock</DialogTitle>
        <DialogDescription>{item.name}</DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
        <div>
          <p className="text-[13px] font-medium text-muted-foreground">
            In stock now
          </p>
          <p className="font-heading text-3xl leading-tight font-bold tabular-nums">
            {item.stockQuantity}
          </p>
        </div>
        <StockBadge level={item} />
      </div>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          dialog.submit();
        }}
      >
        <Tabs
          value={dialog.mode}
          onValueChange={(value) => dialog.setMode(value as AdjustMode)}
        >
          <TabsList className="w-full group-data-horizontal/tabs:h-10">
            {MODES.map((mode) => (
              <TabsTrigger
                key={mode.value}
                value={mode.value}
                disabled={dialog.isPending}
              >
                {mode.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="stock-quantity">Quantity</Label>
            <Input
              id="stock-quantity"
              inputMode="numeric"
              autoFocus
              placeholder={hint}
              value={dialog.quantityInput}
              disabled={dialog.isPending}
              aria-invalid={Boolean(dialog.inputError)}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "" || /^\d{0,5}$/.test(next.trim())) {
                  dialog.setQuantityInput(next);
                }
              }}
            />
          </div>

          <div className="space-y-2">
            <span className="text-sm leading-none font-medium">After</span>
            <p className="flex h-10 items-center gap-2 font-heading text-lg font-bold tabular-nums">
              <span className="text-muted-foreground">
                {item.stockQuantity}
              </span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <span>
                {dialog.plan?.ok ? dialog.plan.after : item.stockQuantity}
              </span>
            </p>
          </div>
        </div>

        {dialog.inputError ? (
          <p className="-mt-2 text-sm text-destructive">{dialog.inputError}</p>
        ) : null}

        {dialog.reasons.length > 1 ? (
          <div className="space-y-2">
            <Label htmlFor="stock-reason">Reason</Label>
            <Select
              value={dialog.reason}
              disabled={dialog.isPending}
              onValueChange={(value) => dialog.setReason(value as AdjustReason)}
            >
              <SelectTrigger id="stock-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dialog.reasons.map((reason) => (
                  <SelectItem key={reason} value={reason}>
                    {REASON_LABELS[reason]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="stock-note">Note</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {dialog.note.length}/{NOTE_LIMIT}
            </span>
          </div>
          <Textarea
            id="stock-note"
            rows={2}
            maxLength={NOTE_LIMIT}
            placeholder="Optional — supplier, invoice, what happened"
            value={dialog.note}
            disabled={dialog.isPending}
            onChange={(event) => dialog.setNote(event.target.value)}
          />
        </div>

        {dialog.error ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive-ink"
          >
            {dialog.error}
          </p>
        ) : null}

        <StockHistoryList rows={dialog.history} failed={dialog.historyFailed} />

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={dialog.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!dialog.canSubmit}>
            {dialog.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
