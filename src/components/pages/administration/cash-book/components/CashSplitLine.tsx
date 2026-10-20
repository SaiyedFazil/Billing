import { cn } from "@/lib/utils";
import {
  CASH_GROUP_LABELS,
  type CashGroup,
  type CashSplit,
} from "@/lib/utils/cash-book";
import { formatINR, isZero } from "@/lib/utils/money";
import { CASH_GROUP_DOT } from "@/lib/utils/payment-method-style";

/** "● Cash ₹… ● Online ₹…" under a KPI. "Other" appears only when non-zero. */
export function CashSplitLine({ split }: { split: CashSplit }) {
  const parts: Array<{ group: CashGroup; amount: string }> = [
    { group: "CASH", amount: split.cash },
    { group: "ONLINE", amount: split.online },
  ];
  if (!isZero(split.other)) parts.push({ group: "OTHER", amount: split.other });

  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {parts.map((part) => (
        <span key={part.group} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn("size-2 rounded-full", CASH_GROUP_DOT[part.group])}
          />
          {CASH_GROUP_LABELS[part.group]}
          <span className="font-semibold tabular-nums">
            {formatINR(part.amount)}
          </span>
        </span>
      ))}
    </span>
  );
}
