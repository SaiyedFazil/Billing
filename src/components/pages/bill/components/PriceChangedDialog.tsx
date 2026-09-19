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

/**
 * Shown when the server's recalculated total disagrees with what the cashier
 * is looking at — a superadmin changed a price while this cart was open.
 * Never charge a different amount than the screen shows. See spec §8.3.
 */
export function PriceChangedDialog({
  message,
  onConfirm,
  onDismiss,
  isSaving,
}: {
  message: string | null;
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
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDismiss} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSaving}>
            {isSaving ? "Saving…" : "Charge the new total"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
