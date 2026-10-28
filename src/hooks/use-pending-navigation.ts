"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** The page a plain left click on this anchor would open, or null if it opens none. */
function inAppDestination(event: MouseEvent): URL | null {
  if (event.button !== 0) return null;
  // Ctrl/Cmd/Shift/Alt-click opens a new tab or window, or downloads.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null;
  }

  const anchor = (event.target as Element | null)?.closest?.("a[href]");
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== "_self") return null;
  if (anchor.hasAttribute("download")) return null;

  const url = new URL(anchor.href);
  return url.origin === window.location.origin ? url : null;
}

/**
 * True from the moment a link to another page is clicked until that page
 * takes over the URL.
 *
 * `loading.tsx` alone cannot promise this. Next shows it at once only when
 * the link's background prefetch has already finished; when it has not — the
 * page was just opened, the prefetch expired, or Netlify's server is waking
 * up — the router keeps the old page on screen until the server answers. This
 * covers that gap, for every link in the shell, without touching the links.
 *
 * Only a change of page counts. A link that changes just the query string
 * (a tab, a filter) keeps its page's own pending state.
 */
export function usePendingNavigation(): boolean {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [settledPathname, setSettledPathname] = useState(pathname);

  // The new page has taken over: clear during render, not in an effect, so
  // the old page's loader never paints over the new page for a frame.
  if (settledPathname !== pathname) {
    setSettledPathname(pathname);
    setPending(false);
  }

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const destination = inAppDestination(event);
      if (destination && destination.pathname !== window.location.pathname) {
        setPending(true);
      }
    }

    // Capture phase, so a handler that stops propagation cannot hide the click.
    document.addEventListener("click", onClick, { capture: true });
    return () =>
      document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return pending;
}
