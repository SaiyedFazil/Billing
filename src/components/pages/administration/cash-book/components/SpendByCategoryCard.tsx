import { formatINR } from "@/lib/utils/money";
import type { CategorySpendRow } from "@/types/expense.types";

/** Where the money went. Cancelled expenses are already left out. */
export function SpendByCategoryCard({ spend }: { spend: CategorySpendRow[] }) {
  return (
    <section className="space-y-4 rounded-[20px] border bg-card p-6 shadow-card">
      <h2 className="font-heading text-lg font-bold">Spend by category</h2>

      <ul className="space-y-3.5">
        {spend.map((row) => (
          <li key={row.categoryId} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-medium">{row.name}</span>
              <span className="font-semibold tabular-nums">
                {formatINR(row.total)}
              </span>
            </div>
            <div aria-hidden className="h-1.5 rounded-full bg-table-head">
              {/* sharePercent is display geometry only; it never becomes money. */}
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${row.sharePercent}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
