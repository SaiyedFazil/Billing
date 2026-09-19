"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
}: {
  from: string;
  to: string;
  /** Precomputed on the server so presets use the SHOP's today, not the browser's. */
  presets: Record<RangePreset, { from: string; to: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function apply(nextFrom: string, nextTo: string) {
    if (!isValidIsoDate(nextFrom) || !isValidIsoDate(nextTo)) return;
    // Swap rather than reject — the user clearly meant the range between them.
    const [start, end] =
      nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
    startTransition(() => {
      router.push(`${pathname}?from=${start}&to=${end}`);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => apply(presets[preset].from, presets[preset].to)}
          >
            {RANGE_PRESET_LABELS[preset]}
          </Button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="range-from" className="text-xs font-normal">
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
        </div>
        <div className="space-y-1">
          <Label htmlFor="range-to" className="text-xs font-normal">
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
    </div>
  );
}
