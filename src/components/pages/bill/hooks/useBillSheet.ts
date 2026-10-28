"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * When the bill sits beside the menu instead of in the sheet: the till-tablet
 * and lg layouts. Must match the till-phone variant in globals.css.
 */
const BILL_BESIDE_MENU =
  "(min-width: 1024px), (min-width: 768px) and (min-height: 600px)";

/**
 * The phone's bill sheet. Opening it adds a history entry on the same URL,
 * so Android's back gesture closes the sheet instead of leaving the till,
 * which would throw the cart away. In an installed app with no history, back
 * would otherwise close the app.
 */
export function useBillSheet() {
  const [open, setOpen] = useState(false);
  const barRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  // Whether our history entry is still there to pop. Tracked here rather than
  // read from history.state, which router.refresh() rewrites.
  const pushed = useRef(false);

  const openSheet = useCallback(() => {
    // Next.js copies its router state into this entry; see "Native History
    // API" in its linking-and-navigating guide.
    window.history.pushState(null, "");
    pushed.current = true;
    setOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    // Pop our entry once; the popstate below then closes the sheet. A second
    // close before it arrives (a double tap) must not go back again.
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      setOpen(false);
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      pushed.current = false;
      setOpen(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Rotating a tablet upright, or widening the window, puts the bill back
  // beside the menu, so the sheet closes.
  useEffect(() => {
    if (!open) return;
    const beside = window.matchMedia(BILL_BESIDE_MENU);
    const onChange = () => {
      if (beside.matches) closeSheet();
    };
    beside.addEventListener("change", onChange);
    return () => beside.removeEventListener("change", onChange);
  }, [open, closeSheet]);

  // The menu behind does not scroll while the sheet is up.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Closing returns focus to the bar that opened the sheet.
  useEffect(() => {
    if (wasOpen.current && !open) barRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return { open, openSheet, closeSheet, barRef };
}
