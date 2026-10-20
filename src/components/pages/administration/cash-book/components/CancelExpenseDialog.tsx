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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatLongDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { ExpenseRow } from "@/types/expense.types";

/**
 * Built on Dialog rather than ConfirmDialog: the reason is a form field, and
 * ConfirmDialog's description cannot host one.
 */
export function CancelExpenseDialog({
  expense,
  reason,
  onReasonChange,
  error,
  isPending,
  onClose,
  onConfirm,
}: {
  expense: ExpenseRow | null;
  reason: string;
  onReasonChange: (reason: string) => void;
  error: string | null;
  isPending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={expense !== null}
      onOpenChange={(open) => (open ? null : onClose())}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel this expense?</DialogTitle>
          {expense ? (
            <DialogDescription>
              {formatINR(expense.amount)} · {expense.categoryName} on{" "}
              {formatLongDate(expense.expenseDate)}. It stays in the list marked
              as cancelled and stops counting. This can&apos;t be undone. If the
              amount was wrong, add a new expense.
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="cancel-reason">Reason</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {reason.length}/200
              </span>
            </div>
            <Textarea
              id="cancel-reason"
              value={reason}
              maxLength={200}
              rows={2}
              autoFocus
              disabled={isPending}
              placeholder="e.g. Entered twice"
              aria-invalid={Boolean(error)}
              onChange={(event) => onReasonChange(event.target.value)}
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={onClose}
            >
              Keep it
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-destructive text-white shadow-none hover:bg-destructive/90"
            >
              {isPending ? "Cancelling…" : "Cancel expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
