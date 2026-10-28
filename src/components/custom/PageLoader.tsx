import { Loader2 } from "lucide-react";

/** A spinner centred in the content area, shown while a page's data loads. */
export function PageLoader() {
  return (
    <div
      role="status"
      className="flex min-h-dvh items-center justify-center max-lg:min-h-[calc(100dvh-3.5rem)]"
    >
      <Loader2 className="size-9 animate-spin text-primary" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
