"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { formatBillDate, formatBillTime } from "@/lib/utils/dates";
import { formatINR, isZero } from "@/lib/utils/money";
import { reprintBillAction } from "@/server/bills/bills-actions";
import type { ReceiptData } from "@/types/bill.types";

export function BillDetails({
  billId,
  receipt,
  status,
}: {
  billId: string;
  receipt: ReceiptData;
  status: "COMPLETED" | "VOID";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleReprint() {
    startTransition(async () => {
      const result = await reprintBillAction({ billId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      // The reprint is logged before the print view opens.
      router.push(REPORT_ROUTES.print(billId));
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={REPORT_ROUTES.bills} aria-label="Back to bills">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              Bill #{receipt.billNumber}
              {status === "VOID" ? (
                <Badge variant="destructive">Void</Badge>
              ) : null}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatBillDate(receipt.businessDate)} at{" "}
              {formatBillTime(receipt.createdAt, receipt.shop.timezone)} · billed
              by {receipt.cashierName}
            </p>
          </div>
        </div>

        <Button onClick={handleReprint} disabled={isPending}>
          <Printer className="size-4" />
          {isPending ? "Opening…" : "Reprint"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.lines.map((line, index) => (
                <TableRow key={`${line.itemName}-${index}`}>
                  <TableCell className="font-medium">{line.itemName}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatINR(line.unitPrice)}
                  </TableCell>
                  <TableCell className="tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(line.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Separator />

          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatINR(receipt.subtotal)}</dd>
            </div>
            {isZero(receipt.discount) ? null : (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular-nums">-{formatINR(receipt.discount)}</dd>
              </div>
            )}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatINR(receipt.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Paid by</dt>
              <dd>{PAYMENT_METHOD_LABELS[receipt.paymentMethod]}</dd>
            </div>
            {receipt.tendered !== null ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tendered</dt>
                  <dd className="tabular-nums">{formatINR(receipt.tendered)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Change</dt>
                  <dd className="tabular-nums">
                    {formatINR(receipt.changeDue ?? "0.00")}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Item names and prices are exactly as they were when this bill was
        issued. Later menu changes do not affect this record.
      </p>
    </div>
  );
}
