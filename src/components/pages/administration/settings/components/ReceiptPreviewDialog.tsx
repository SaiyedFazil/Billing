"use client";

import { Receipt80mm } from "@/components/pages/print/components/Receipt80mm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PrinterWidth } from "@/lib/validation/settings-schema";
import type { ReceiptData } from "@/types/bill.types";

import "@/components/pages/print/receipt.css";

/** A fixed sample bill so the preview never depends on real sales. */
function sampleReceipt(shop: ReceiptData["shop"]): ReceiptData {
  return {
    billNumber: 47,
    businessDate: "2026-08-26",
    createdAt: new Date("2026-08-26T14:12:00Z"),
    cashierName: "Ravi",
    lines: [
      {
        itemName: "Veg Burger",
        quantity: 2,
        unitPrice: "60.00",
        lineTotal: "120.00",
      },
      {
        itemName: "Coke Small",
        quantity: 1,
        unitPrice: "30.00",
        lineTotal: "30.00",
      },
    ],
    subtotal: "150.00",
    discount: "10.00",
    total: "140.00",
    paymentMethod: "CASH",
    tendered: "200.00",
    changeDue: "60.00",
    shop,
  };
}

export function ReceiptPreviewDialog({
  open,
  onOpenChange,
  shopName,
  addressLine,
  phone,
  receiptFooter,
  printerWidth,
  timezone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shopName: string;
  addressLine: string;
  phone: string;
  receiptFooter: string;
  printerWidth: PrinterWidth;
  timezone: string;
}) {
  const receipt = sampleReceipt({
    name: shopName || "Shop name",
    addressLine: addressLine || null,
    phone: phone || null,
    receiptFooter: receiptFooter || null,
    printerWidth,
    timezone,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receipt preview</DialogTitle>
          <DialogDescription>
            A sample bill, not real data. It follows whatever is typed in the
            form, including changes not yet saved.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] justify-center overflow-y-auto rounded-2xl border border-dashed bg-muted/70 px-4 py-8">
          <div className="shadow-lift">
            <Receipt80mm receipt={receipt} narrow={printerWidth === "MM_58"} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Print settings are configured on the till — see docs/printer-setup.md.
        </p>
      </DialogContent>
    </Dialog>
  );
}
