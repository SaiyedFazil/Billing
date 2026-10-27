"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Marks the history entry the sheet pushes, so closing can pop it. */
const SHEET_ENTRY = "billSheet";

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

  const openSheet = useCallback(() => {
    // Next.js copies its router state into this entry; see "Native History
    // API" in its linking-and-navigating guide.
    window.history.pushState({ [SHEET_ENTRY]: true }, "");
    setOpen(true);
  }, []);

  const closeSheet = useCallback(() => {
    // Pop our own entry; the popstate below then closes the sheet.
    if (window.history.state?.[SHEET_ENTRY]) window.history.back();
    else setOpen(false);
  }, []);

  useEffect(() => {
    const onPopState = () => setOpen(false);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // From md the bill sits beside the menu again, so rotating a phone or
  // widening the window closes the sheet.
  useEffect(() => {
    if (!open) return;
    const wide = window.matchMedia("(min-width: 768px)");
    const onChange = () => {
      if (wide.matches) closeSheet();
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
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
