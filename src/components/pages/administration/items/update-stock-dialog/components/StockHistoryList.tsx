import { History } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { StockMovementRow } from "@/types/stock.types";

import { describeMovement } from "../utils/describe-movement";

const WHEN = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const TONE = {
  up: "text-success-ink",
  down: "text-destructive-ink",
  neutral: "text-foreground",
} as const;

/** The item's last few stock changes, so "why is it 12?" has an answer. */
export function StockHistoryList({
  rows,
  failed,
}: {
  rows: StockMovementRow[] | null;
  failed: boolean;
}) {
  return (
    <section className="space-y-2.5">
      <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
        <History className="size-3.5" />
        Recent changes
      </h3>

      {failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t load the history. Close and reopen to try again.
        </p>
      ) : rows === null ? (
        <div className="space-y-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes yet.</p>
      ) : (
        <ol className="max-h-52 divide-y divide-border/70 overflow-y-auto rounded-xl border">
          {rows.map((row) => {
            const { label, change, tone } = describeMovement(row);
            return (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {WHEN.format(new Date(row.createdAt))} · {row.createdByName}
                    {row.note ? ` · ${row.note}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <p className={cn("text-sm font-bold", TONE[tone])}>
                    {change}
                  </p>
                  {row.type === "OPENING" ? null : (
                    <p className="text-xs text-muted-foreground">
                      → {row.quantityAfter}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
