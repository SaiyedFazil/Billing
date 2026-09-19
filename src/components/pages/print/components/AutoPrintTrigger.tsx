"use client";

import { useEffect } from "react";

export function AutoPrintTrigger() {
  useEffect(() => {
    // A short delay so fonts and layout settle before the print dialog opens;
    // printing mid-layout produces a clipped first line on some printers.
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
