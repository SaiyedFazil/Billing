"use client";

import { ChevronUp, ReceiptText } from "lucide-react";

import { formatINR } from "@/lib/utils/money";

/**
 * The phone's bill at a glance, fixed to the bottom of the till. It is always
 * there, so nothing jumps when the first item goes on; tapping it opens the
 * bill. Hidden from md, where the bill sits beside the menu.
 */
export function BillBar({
  itemCount,
  total,
  expanded,
  onOpen,
  ref,
}: {
  itemCount: number;
  total: string;
  /** The sheet is open: the bar is covered and out of reach. */
  expanded: boolean;
  onOpen: () => void;
  ref: React.Ref<HTMLButtonElement>;
}) {
  const empty = itemCount === 0;

  return (
    <div
      inert={expanded}
      className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_32px_-20px_rgb(28_23_20/0.4)] backdrop-blur-sm md:hidden"
    >
      <button
        ref={ref}
        type="button"
        disabled={empty}
        aria-expanded={expanded}
        aria-controls="current-bill"
        onClick={onOpen}
        className="flex h-14 w-full cursor-pointer items-center gap-3 rounded-2xl bg-primary px-4 text-left text-white shadow-brand transition-colors hover:bg-primary-hover disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
      >
        <ReceiptText className="size-5 shrink-0" />
        {empty ? (
          <span className="font-semibold">No items yet</span>
        ) : (
          <>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block text-xs font-medium text-white/80">
                {itemCount} item{itemCount === 1 ? "" : "s"}
              </span>
              <span className="block font-heading text-lg font-bold tabular-nums">
                {formatINR(total)}
              </span>
            </span>
            <span className="flex shrink-0 items-center gap-1 font-semibold">
              View bill
              <ChevronUp className="size-4" />
            </span>
          </>
        )}
      </button>
    </div>
  );
}
