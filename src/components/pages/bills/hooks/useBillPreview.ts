"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import {
  getBillReceiptAction,
  reprintBillAction,
} from "@/server/bills/bills-actions";
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
  const [isReprinting, startReprinting] = useTransition();

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
    const { id } = bill;

    // Opened synchronously, before any await: a popup blocker stops a
    // window.open() that happens after one. It is pointed at the receipt only
    // once the reprint has been recorded, so an unlogged copy is never handed
    // out — that audit trail is the whole point of reprintBillAction.
    const tab = window.open("", "_blank");

    startReprinting(async () => {
      const result = await reprintBillAction({ billId: id });

      if (!result.ok) {
        tab?.close();
        toast.error(result.error.message);
        return;
      }

      if (tab) {
        tab.location.replace(REPORT_ROUTES.print(id));
        return;
      }
      // The browser blocked the tab — fall back to the bill details page's
      // behaviour and print in this one.
      router.push(REPORT_ROUTES.print(id));
    });
  }, [bill, router]);

  return {
    bill,
    receipt,
    error,
    isLoading,
    isReprinting,
    isOpen: bill !== null,
    open,
    close,
    reprint,
  };
}
