"use client";

import { Printer } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Below lg, under the receipt and never printed. A phone has no Ctrl+P, and
 * iPhone Safari may refuse the automatic print once the tap that started Save
 * & Print is a few seconds old, so Print is always one tap away. Back to
 * billing replaces this page in the history, so the back gesture from the
 * till does not land here and print the receipt again.
 */
export function ReceiptPhoneActions() {
  return (
    <div className="no-print mx-auto flex w-full max-w-[72mm] flex-col gap-3 px-4 pt-2 pb-8 lg:hidden">
      <Button
        type="button"
        variant="dark"
        className="h-12 w-full text-base"
        onClick={() => window.print()}
      >
        <Printer className="size-5" />
        Print
      </Button>
      <Button variant="outline" className="h-12 w-full text-base" asChild>
        <Link href="/bill" replace>
          Back to billing
        </Link>
      </Button>
    </div>
  );
}
