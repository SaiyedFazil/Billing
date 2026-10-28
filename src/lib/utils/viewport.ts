/**
 * Screen and device questions for behaviour that differs on a phone. Client
 * only: call them in effects and event handlers, never during render, so the
 * server-rendered page and the first client render always agree.
 */

/** Below the `lg` breakpoint, where the sidebar becomes the top bar. */
export function isBelowDesktop(): boolean {
  return window.matchMedia("(max-width: 1023.98px)").matches;
}

/** No mouse or trackpad at all: a phone or a tablet, not a touchscreen PC. */
export function hasNoFinePointer(): boolean {
  return !window.matchMedia("(any-pointer: fine)").matches;
}

/**
 * A phone or tablet operating system (Android, iOS, iPadOS), whose keyboard is
 * on screen. Unlike the pointer checks, this tells a tablet held sideways
 * (desktop-wide, touch only) from the till: a Windows or Mac touchscreen PC,
 * which may have a USB keyboard and no mouse at all.
 */
export function isMobileOS(): boolean {
  const { userAgent, maxTouchPoints } = navigator;
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return true;
  // iPadOS asks for desktop sites and reports itself as a Mac; a real Mac has
  // no touch points.
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** Opened from the home screen rather than in a browser tab. */
export function isInstalledApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}
