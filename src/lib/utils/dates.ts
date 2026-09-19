/**
 * The shop's business date.
 *
 * Timestamps are stored in UTC, but "today's sales" must mean today in the
 * shop's timezone. Without this, a bill rung up at 00:30 IST would land on the
 * previous calendar day in UTC and be attributed to yesterday. See spec §6.11.
 *
 * Returns `YYYY-MM-DD`, which is exactly what a Postgres `date` column wants.
 */
export function businessDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** "2026-08-26" -> "26/08/26", the compact form used on receipts. */
export function formatBillDate(businessDateIso: string): string {
  const [year, month, day] = businessDateIso.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

/**
 * "2026-09-19" -> "Saturday 19 September", for page headers.
 *
 * Built from the calendar parts at UTC midnight and formatted in UTC, so the
 * browser's own timezone can never shift it to the previous day.
 */
export function formatLongDate(businessDateIso: string): string {
  const [year, month, day] = businessDateIso.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** 24-hour clock in the shop's timezone, for the receipt header. */
export function formatBillTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}
