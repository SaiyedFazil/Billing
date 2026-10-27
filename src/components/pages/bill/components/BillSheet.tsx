"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Below md, the bill as a sheet that slides up over the menu. From md this
 * wrapper dissolves (display: contents) and the bill sits in the till's grid
 * exactly as before. Either way there is one CartPanel, so its fields keep
 * one id each and one state.
 *
 * Closed, the sheet is off-screen and `invisible` through CSS alone, so it is
 * out of the tab order from the first paint.
 */
export function BillSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // A modal sheet: Escape closes it, and Tab cycles inside it.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !panelRef.current) return;
    const items = [
      ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
    ].filter((el) => el.getClientRects().length > 0);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === panelRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-40 bg-sidebar/45 transition-opacity duration-200 motion-reduce:transition-none md:hidden",
          open ? "opacity-100" : "pointer-events-none invisible opacity-0",
        )}
      />
      <div
        ref={panelRef}
        id="current-bill"
        role={open ? "dialog" : undefined}
        aria-modal={open || undefined}
        aria-labelledby={open ? "current-bill-title" : undefined}
        tabIndex={open ? -1 : undefined}
        onKeyDown={onKeyDown}
        className={cn(
          "outline-none md:contents",
          "motion-reduce:transition-none max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:flex max-md:max-h-[90dvh] max-md:flex-col max-md:overflow-y-auto max-md:overscroll-contain max-md:rounded-t-3xl max-md:bg-card max-md:pb-[env(safe-area-inset-bottom)] max-md:shadow-[0_-24px_64px_-24px_rgb(28_23_20/0.45)] max-md:duration-200",
          // Opening shows the sheet at once, so focus can move into it at
          // once; closing keeps it visible until it has slid away.
          open
            ? "max-md:transition-[translate]"
            : "max-md:invisible max-md:translate-y-full max-md:transition-[translate,visibility]",
        )}
      >
        <div className="flex shrink-0 justify-center pt-2.5 md:hidden">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-border" />
        </div>
        <button
          type="button"
          aria-label="Close bill"
          onClick={onClose}
          className="absolute top-4 right-3 z-10 flex size-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted md:hidden"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </>
  );
}
