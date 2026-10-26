"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";

import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { getBillReceiptAction } from "@/server/bills/bills-actions";
import type { ReceiptData } from "@/types/bill.types";
import type { BillLedgerRow } from "@/types/report.types";

/** What the dialog header needs before the receipt itself has arrived. */
export type PreviewedBill = {
  id: string;
  billNumber: number;
  status: BillLedgerRow["status"];
};

export function useBillPreview() {
  const router = useRouter();
  const [bill, setBill] = useState<PreviewedBill | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, startLoading] = useTransition();

  // Opening a second row before the first response lands would otherwise let
  // the stale reply overwrite the newer one.
  const latestRequest = useRef<string | null>(null);

  const open = useCallback((row: BillLedgerRow) => {
    setBill({ id: row.id, billNumber: row.billNumber, status: row.status });
    setReceipt(null);
    setError(null);
    latestRequest.current = row.id;

    startLoading(async () => {
      const result = await getBillReceiptAction({ billId: row.id });
      if (latestRequest.current !== row.id) return;

      if (result.ok) {
        setReceipt(result.data);
        return;
      }
      setError(result.error.message);
    });
  }, []);

  const close = useCallback(() => {
    latestRequest.current = null;
    setBill(null);
    setReceipt(null);
    setError(null);
  }, []);

  const reprint = useCallback(() => {
    if (!bill) return;
    const href = REPORT_ROUTES.print(bill.id);

    // Opened straight from the click, so a popup blocker lets it through. If
    // the browser blocks the tab anyway, print in this one, as the bill
    // details page does.
    if (!window.open(href, "_blank")) router.push(href);
  }, [bill, router]);

  return {
    bill,
    receipt,
    error,
    isLoading,
    isOpen: bill !== null,
    open,
    close,
    reprint,
  };
}
