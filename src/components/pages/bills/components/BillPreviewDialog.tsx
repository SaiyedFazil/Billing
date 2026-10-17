"use client";

import { AlertCircle, Loader2, Printer } from "lucide-react";

import { Receipt58mm } from "@/components/pages/print/components/Receipt58mm";
import { Receipt80mm } from "@/components/pages/print/components/Receipt80mm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBillDate } from "@/lib/utils/dates";
import type { ReceiptData } from "@/types/bill.types";

import type { PreviewedBill } from "../hooks/useBillPreview";

import "@/components/pages/print/receipt.css";

function ReceiptBody({ receipt }: { receipt: ReceiptData }) {
  return (
    <div className="flex justify-center rounded-2xl border border-dashed bg-muted/70 px-4 py-8">
      <div className="shadow-lift">
        {receipt.shop.printerWidth === "MM_58" ? (
          <Receipt58mm receipt={receipt} />
        ) : (
          <Receipt80mm receipt={receipt} />
        )}
      </div>
    </div>
  );
}

export function BillPreviewDialog({
  bill,
  receipt,
  error,
  isLoading,
  isReprinting,
  isOpen,
  onClose,
  onReprint,
}: {
  bill: PreviewedBill | null;
  receipt: ReceiptData | null;
  error: string | null;
  isLoading: boolean;
  isReprinting: boolean;
  isOpen: boolean;
  onClose: () => void;
  onReprint: () => void;
}) {
  return (
    <Dialog open={isOpen} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2.5">
            Bill #{bill?.billNumber}
            {bill?.status === "VOID" ? (
              <Badge variant="destructive" dot>
                Void
              </Badge>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {receipt
              ? `${formatBillDate(receipt.businessDate)} · billed by ${receipt.cashierName}`
              : "The receipt exactly as it was printed."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed bg-muted/70 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading the receipt…
            </div>
          ) : error ? (
            <p
              role="alert"
              className="flex gap-2 rounded-2xl bg-destructive-soft p-4 text-sm font-medium text-destructive-ink"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          ) : receipt ? (
            <ReceiptBody receipt={receipt} />
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={!receipt || isReprinting}
            onClick={onReprint}
          >
            <Printer className="size-4" />
            {isReprinting ? "Opening…" : "Reprint"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
