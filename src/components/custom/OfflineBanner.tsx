"use client";

import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * The worst outcome in a shop is a cashier believing a bill saved when it did
 * not, handing over the food, and losing the sale from the books. This says so
 * unambiguously. See spec §11.4.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-destructive px-4 py-2.5 text-sm font-semibold text-white"
    >
      <WifiOff className="size-4 shrink-0" />
      No internet connection — bills CANNOT be saved right now.
    </div>
  );
}
