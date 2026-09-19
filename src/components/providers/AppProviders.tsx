"use client";

import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      {/* top-center so a busy cashier sees it without looking away from the
          cart, and richColors so success and failure are distinguishable at a
          glance. */}
      <Toaster richColors position="top-center" />
    </>
  );
}
