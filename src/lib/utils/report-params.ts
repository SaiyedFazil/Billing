import {
  isValidIsoDate,
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
} from "./date-range";

export type PresetMap = Record<RangePreset, { from: string; to: string }>;

/**
 * For export actions, which take the range as an argument rather than from the
 * URL: null when it is usable, otherwise the message to show.
 */
export function rangeError(input: { from: string; to: string }): string | null {
  if (!isValidIsoDate(input.from) || !isValidIsoDate(input.to)) {
    return "Choose a valid date range.";
  }
  if (input.from > input.to) {
    return "The start date must be before the end date.";
  }
  return null;
}

/**
 * Resolves `?from=&to=` into a valid range, falling back to a preset when the
 * values are missing or malformed — a report page must never crash on a
 * hand-edited URL.
 *
 * Presets are computed here, on the server, so they use the shop's today.
 */
export function resolveReportRange(
  params: Record<string, string | string[] | undefined>,
  timeZone: string,
  fallbackPreset: RangePreset,
): { from: string; to: string; presets: PresetMap } {
  const fallback = presetRange(fallbackPreset, timeZone);

  const read = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  const rawFrom = read("from");
  const rawTo = read("to");

  let from = isValidIsoDate(rawFrom) ? rawFrom : fallback.from;
  let to = isValidIsoDate(rawTo) ? rawTo : fallback.to;
  if (from > to) [from, to] = [to, from];

  const presets = Object.fromEntries(
    RANGE_PRESETS.map((preset) => [preset, presetRange(preset, timeZone)]),
  ) as PresetMap;

  return { from, to, presets };
}
