"use client";

import {
  type LucideIcon,
  PackageCheck,
  PackageX,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { StockFilter } from "@/lib/utils/stock";

type TileStatus = Extract<StockFilter, "IN_STOCK" | "LOW" | "OUT">;

const TILES: Array<{
  status: TileStatus;
  label: string;
  icon: LucideIcon;
  chip: string;
}> = [
  {
    status: "IN_STOCK",
    label: "In stock",
    icon: PackageCheck,
    chip: "bg-success-soft text-success-ink",
  },
  {
    status: "LOW",
    label: "Low stock",
    icon: TriangleAlert,
    chip: "bg-warning-soft text-warning-ink",
  },
  {
    status: "OUT",
    label: "Out of stock",
    icon: PackageX,
    chip: "bg-destructive-soft text-destructive-ink",
  },
];

/**
 * Counts of tracked items by stock status. Each tile is also a filter toggle:
 * pressing the active one shows everything again.
 */
export function StockSummaryTiles({
  counts,
  filter,
  onFilterChange,
}: {
  counts: Record<TileStatus, number>;
  filter: StockFilter;
  onFilterChange: (next: StockFilter) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {TILES.map(({ status, label, icon: Icon, chip }) => {
        const active = filter === status;
        return (
          <button
            key={status}
            type="button"
            aria-pressed={active}
            onClick={() => onFilterChange(active ? "ALL" : status)}
            className={cn(
              "flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 text-left shadow-card transition-all sm:p-4",
              "focus-visible:ring-4 focus-visible:ring-brand/25 focus-visible:outline-none",
              active
                ? "border-primary ring-1 ring-primary"
                : "hover:-translate-y-0.5 hover:shadow-lift",
            )}
          >
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-[10px] max-sm:hidden",
                chip,
              )}
            >
              <Icon className="size-4.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium text-muted-foreground max-sm:leading-tight max-sm:whitespace-normal">
                {label}
              </span>
              <span className="block font-heading text-xl leading-tight font-bold tabular-nums">
                {counts[status]}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
