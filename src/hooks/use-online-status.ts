"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/** There is no navigator during SSR; assume online and let the client correct. */
function getServerSnapshot(): boolean {
  return true;
}

/**
 * Subscribes to the browser's online/offline events.
 *
 * useSyncExternalStore rather than useEffect + useState: this is a genuine
 * external store, and reading it in an effect would cause a cascading render
 * on every mount.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
