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

/** Opened from the home screen rather than in a browser tab. */
export function isInstalledApp(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches;
}
