import { cn } from "@/lib/utils";
import {
  type StockLevel,
  type StockStatus,
  stockStatus,
} from "@/lib/utils/stock";

/**
 * The one place stock status gets its colour and wording, so the Items page,
 * the Dashboard and the item dialog can never disagree. See the stock spec
 * §9.1.
 */
export const STOCK_STATUS_STYLE: Record<
  StockStatus,
  { label: string; pill: string; dot: string }
> = {
  IN_STOCK: {
    label: "In stock",
    pill: "bg-success-soft text-success-ink",
    dot: "bg-success",
  },
  LOW: {
    label: "Low stock",
    pill: "bg-warning-soft text-warning-ink",
    dot: "bg-warning",
  },
  OUT: {
    label: "Out of stock",
    pill: "bg-destructive-soft text-destructive-ink",
    dot: "bg-destructive",
  },
  UNTRACKED: {
    label: "Not tracked",
    pill: "text-muted-foreground",
    dot: "bg-muted-foreground/40",
  },
};

function badgeText(status: StockStatus, quantity: number): string {
  switch (status) {
    case "IN_STOCK":
      return String(quantity);
    case "LOW":
      return `${quantity} · Low`;
    case "OUT":
      return "Out of stock";
    case "UNTRACKED":
      return "—";
  }
}

export function StockBadge({
  level,
  className,
}: {
  level: StockLevel;
  className?: string;
}) {
  const status = stockStatus(level);
  const style = STOCK_STATUS_STYLE[status];

  if (status === "UNTRACKED") {
    return (
      <span className={cn("text-muted-foreground", className)}>
        —<span className="sr-only">{style.label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap tabular-nums",
        style.pill,
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", style.dot)} />
      {badgeText(status, level.stockQuantity)}
      {status === "IN_STOCK" ? (
        <span className="sr-only"> in stock</span>
      ) : null}
    </span>
  );
}
