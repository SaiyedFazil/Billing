"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { PriceChangeStep } from "../utils/price-change";

/**
 * Shown when the server's recalculated total disagrees with what the cashier
 * is looking at — a superadmin changed a price while this cart was open.
 * Never charge a different amount than the screen shows. See spec §8.3.
 *
 * The confirm button waits for the till to re-price the bill (`UPDATING`),
 * and is withdrawn if the bill cannot reach the server's total (`CHANGED_AGAIN`).
 */
export function PriceChangedDialog({
  message,
  step,
  onConfirm,
  onDismiss,
  isSaving,
}: {
  message: string | null;
  step: PriceChangeStep | null;
  onConfirm: () => void;
  onDismiss: () => void;
  isSaving: boolean;
}) {
  return (
    <Dialog
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) onDismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prices changed</DialogTitle>
          <DialogDescription>
            {message}
            {step === "CHANGED_AGAIN" &&
              " The bill changed again. Check it and press Save."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDismiss} disabled={isSaving}>
            Cancel
          </Button>
          {step === "UPDATING" && <Button disabled>Updating prices…</Button>}
          {step === "READY" && (
            <Button onClick={onConfirm} disabled={isSaving}>
              {isSaving ? "Saving…" : "Charge the new total"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
