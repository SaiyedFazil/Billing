"use client";

import { ArrowLeft, Info, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { PaymentMethodLabel } from "@/components/custom/PaymentMethodLabel";
import { TableCard } from "@/components/custom/TableCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { formatBillDate, formatBillTime } from "@/lib/utils/dates";
import { formatINR, isZero } from "@/lib/utils/money";
import { reprintBillAction } from "@/server/bills/bills-actions";
import type { ReceiptData } from "@/types/bill.types";

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

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
      <PageHeader
        leading={
          <Button variant="outline" size="icon" className="mt-1" asChild>
            <Link href={REPORT_ROUTES.bills} aria-label="Back to bills">
              <ArrowLeft />
            </Link>
          </Button>
        }
        eyebrow="Bill"
        title={
          <>
            #{receipt.billNumber}
            {status === "VOID" ? (
              <Badge variant="destructive" dot>
                Void
              </Badge>
            ) : (
              <Badge variant="success" dot>
                Completed
              </Badge>
            )}
          </>
        }
        description={`${formatBillDate(receipt.businessDate)} at ${formatBillTime(
          receipt.createdAt,
          receipt.shop.timezone,
        )} · billed by ${receipt.cashierName}`}
        actions={
          <Button onClick={handleReprint} disabled={isPending}>
            <Printer />
            {isPending ? "Opening…" : "Reprint"}
          </Button>
        }
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <TableCard>
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="font-heading text-lg font-bold">Items</h2>
            <span className="text-muted-foreground text-sm">
              {receipt.lines.length} line{receipt.lines.length === 1 ? "" : "s"}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.lines.map((line, index) => (
                <TableRow key={`${line.itemName}-${index}`}>
                  <TableCell className="font-semibold">{line.itemName}</TableCell>
                  <TableCell className="text-foreground/80 text-right tabular-nums">
                    {formatINR(line.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {line.quantity}
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">
                    {formatINR(line.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>

        <section
          aria-label="Bill summary"
          className="bg-card shadow-card overflow-hidden rounded-[20px] border"
        >
          <dl className="space-y-2.5 p-5 text-sm">
            <SummaryRow label="Subtotal">{formatINR(receipt.subtotal)}</SummaryRow>
            {isZero(receipt.discount) ? null : (
              <SummaryRow label="Discount">
                -{formatINR(receipt.discount)}
              </SummaryRow>
            )}
          </dl>

          <div className="relative space-y-4 border-t-2 border-dashed border-[#e6ded3] bg-[#fffcf9] p-5">
            <span
              aria-hidden
              className="bg-background absolute -top-3 -left-3 size-6 rounded-full border"
            />
            <span
              aria-hidden
              className="bg-background absolute -top-3 -right-3 size-6 rounded-full border"
            />
            <div className="flex items-end justify-between">
              <span className="text-foreground/80 pb-1 font-semibold">Total</span>
              <span className="font-heading text-[34px] leading-none font-extrabold tracking-tight tabular-nums">
                {formatINR(receipt.total)}
              </span>
            </div>
            <dl className="space-y-2.5 border-t pt-4 text-sm">
              <SummaryRow label="Paid by">
                <PaymentMethodLabel method={receipt.paymentMethod} />
              </SummaryRow>
              {receipt.tendered !== null ? (
                <>
                  <SummaryRow label="Tendered">
                    {formatINR(receipt.tendered)}
                  </SummaryRow>
                  <SummaryRow label="Change">
                    {formatINR(receipt.changeDue ?? "0.00")}
                  </SummaryRow>
                </>
              ) : null}
            </dl>
          </div>
        </section>
      </div>

      <p className="text-muted-foreground flex items-start gap-2 text-xs">
        <Info className="mt-px size-3.5 shrink-0" />
        Item names and prices are exactly as they were when this bill was
        issued. Later menu changes do not affect this record.
      </p>
    </div>
  );
}
