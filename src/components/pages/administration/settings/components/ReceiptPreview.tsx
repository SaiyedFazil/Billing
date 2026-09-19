"use client";

import { Receipt80mm } from "@/components/pages/print/components/Receipt80mm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export function ReceiptPreview({
  shopName,
  addressLine,
  phone,
  receiptFooter,
  printerWidth,
  timezone,
}: {
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
    <Card>
      <CardHeader>
        <CardTitle>Receipt preview</CardTitle>
        <CardDescription>Updates as you type.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-muted/70 flex justify-center rounded-2xl border border-dashed px-4 py-8">
          <div className="shadow-lift">
            <Receipt80mm receipt={receipt} narrow={printerWidth === "MM_58"} />
          </div>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          A sample bill, not real data. Print settings are configured on the
          till — see docs/printer-setup.md.
        </p>
      </CardContent>
    </Card>
  );
}
