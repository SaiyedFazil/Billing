"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * In the till's phone layout (a phone, or a phone held sideways), the bill as
 * a sheet that slides up over the menu. Otherwise this wrapper dissolves
 * (display: contents) and the bill sits in the till's grid exactly as
 * before. Either way there is one CartPanel, so its fields keep one id each
 * and one state.
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
          "fixed inset-0 z-40 hidden bg-sidebar/45 transition-opacity duration-200 motion-reduce:transition-none till-phone:block",
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
          "contents outline-none",
          // Clipped sideways: the ticket's notches must not make it scroll.
          "till-phone:fixed till-phone:inset-x-0 till-phone:bottom-0 till-phone:z-50 till-phone:flex till-phone:max-h-[90dvh] till-phone:flex-col till-phone:overflow-x-hidden till-phone:overflow-y-auto till-phone:overscroll-contain till-phone:rounded-t-3xl till-phone:bg-card till-phone:pb-[env(safe-area-inset-bottom)] till-phone:shadow-[0_-24px_64px_-24px_rgb(28_23_20/0.45)] till-phone:duration-200 till-phone:motion-reduce:transition-none",
          // Opening shows the sheet at once, so focus can move into it at
          // once; closing keeps it visible until it has slid away.
          open
            ? "till-phone:transition-[translate]"
            : "till-phone:invisible till-phone:translate-y-full till-phone:transition-[translate,visibility]",
        )}
      >
        <div className="hidden shrink-0 justify-center pt-2.5 till-phone:flex">
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-border" />
        </div>
        <button
          type="button"
          aria-label="Close bill"
          onClick={onClose}
          className="absolute top-4 right-3 z-10 hidden size-10 cursor-pointer items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted till-phone:flex"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </>
  );
}
