import { businessDate } from "./dates";

export const RANGE_PRESETS = [
  "TODAY",
  "YESTERDAY",
  "LAST_7",
  "LAST_30",
  "THIS_MONTH",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  TODAY: "Today",
  YESTERDAY: "Yesterday",
  LAST_7: "Last 7 days",
  LAST_30: "Last 30 days",
  THIS_MONTH: "This month",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

/** Shifts a YYYY-MM-DD string by whole days without touching timezones. */
export function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Presets are computed from the SHOP's today, not the server's, so a report
 * run at 01:00 IST still means the right day.
 */
export function presetRange(
  preset: RangePreset,
  timeZone: string,
): { from: string; to: string } {
  const today = businessDate(new Date(), timeZone);

  switch (preset) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const yesterday = shiftIsoDate(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "LAST_7":
      return { from: shiftIsoDate(today, -6), to: today };
    case "LAST_30":
      return { from: shiftIsoDate(today, -29), to: today };
    case "THIS_MONTH":
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/** Every date in an inclusive range — used to fill chart gaps with zeros. */
export function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  // Guard against an inverted or absurd range producing a runaway loop.
  let guard = 0;
  while (cursor <= to && guard < 1000) {
    dates.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
    guard += 1;
  }
  return dates;
}
