"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  isValidIsoDate,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  type RangePreset,
} from "@/lib/utils/date-range";

export function ReportDateRangeBar({
  from,
  to,
  presets,
  keepParams,
}: {
  from: string;
  to: string;
  /** Precomputed on the server so presets use the SHOP's today, not the browser's. */
  presets: Record<RangePreset, { from: string; to: string }>;
  /**
   * Other URL params to carry across a range change. Without it a range
   * change keeps only from and to, which resets the page and every filter.
   */
  keepParams?: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  // A custom range matches no preset, so nothing is highlighted.
  const activePreset = RANGE_PRESETS.find(
    (preset) => presets[preset].from === from && presets[preset].to === to,
  );

  function apply(nextFrom: string, nextTo: string) {
    if (!isValidIsoDate(nextFrom) || !isValidIsoDate(nextTo)) return;
    // Swap rather than reject — the user clearly meant the range between them.
    const [start, end] =
      nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
    const query = new URLSearchParams({ from: start, to: end });
    for (const [key, value] of Object.entries(keepParams ?? {})) {
      if (value) query.set(key, value);
    }
    startTransition(() => {
      router.push(`${pathname}?${query.toString()}`);
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="group"
        aria-label="Date range"
        className="flex flex-wrap gap-1 rounded-[14px] border bg-card p-1 shadow-card"
      >
        {RANGE_PRESETS.map((preset) => {
          const active = preset === activePreset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={active}
              disabled={isPending}
              onClick={() => apply(presets[preset].from, presets[preset].to)}
              className={cn(
                "h-9 cursor-pointer rounded-[10px] px-3.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "bg-foreground font-semibold text-background"
                  : "font-medium text-foreground/80 hover:bg-muted",
              )}
            >
              {RANGE_PRESET_LABELS[preset]}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label
          htmlFor="range-from"
          className="text-[13px] text-muted-foreground"
        >
          From
        </Label>
        <Input
          id="range-from"
          type="date"
          value={from}
          className="w-40"
          disabled={isPending}
          onChange={(event) => apply(event.target.value, to)}
        />
        <Label
          htmlFor="range-to"
          className="ml-1 text-[13px] text-muted-foreground"
        >
          To
        </Label>
        <Input
          id="range-to"
          type="date"
          value={to}
          className="w-40"
          disabled={isPending}
          onChange={(event) => apply(from, event.target.value)}
        />
      </div>
    </div>
  );
}
