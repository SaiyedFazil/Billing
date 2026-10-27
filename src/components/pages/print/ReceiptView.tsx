import Link from "next/link";

import type { ReceiptData } from "@/types/bill.types";

import { AutoPrintTrigger } from "./components/AutoPrintTrigger";
import { ReceiptPhoneActions } from "./components/ReceiptPhoneActions";
import { Receipt58mm } from "./components/Receipt58mm";
import { Receipt80mm } from "./components/Receipt80mm";

export function ReceiptView({ receipt }: { receipt: ReceiptData }) {
  return (
    <>
      <AutoPrintTrigger />

      {receipt.shop.printerWidth === "MM_58" ? (
        <Receipt58mm receipt={receipt} />
      ) : (
        <Receipt80mm receipt={receipt} />
      )}

      <div className="no-print p-4 text-center max-lg:hidden">
        <Link href="/bill" className="text-sm underline">
          Back to billing
        </Link>
      </div>
      <ReceiptPhoneActions />
    </>
  );
}
