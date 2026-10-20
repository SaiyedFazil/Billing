import {
  EXPENSE_MODE_LABELS,
  type ExpenseMode,
} from "@/constants/expense-modes";
import { cn } from "@/lib/utils";
import { expenseModeGroup } from "@/lib/utils/cash-book";
import { CASH_GROUP_DOT } from "@/lib/utils/payment-method-style";

/** A neutral pill: the dot says cash or online, the label says how. */
export function ExpenseModePill({ mode }: { mode: ExpenseMode }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-table-head px-2.5 text-xs font-semibold whitespace-nowrap">
      <span
        aria-hidden
        className={cn(
          "size-2 rounded-full",
          CASH_GROUP_DOT[expenseModeGroup(mode)],
        )}
      />
      {EXPENSE_MODE_LABELS[mode]}
    </span>
  );
}
