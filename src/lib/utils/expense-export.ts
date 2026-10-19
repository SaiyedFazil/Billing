import { EXPENSE_MODE_LABELS } from "@/constants/expense-modes";
import type { ExpenseRow } from "@/types/expense.types";

import { CASH_GROUP_LABELS, expenseModeGroup } from "./cash-book";
import { csvAmount, toCsv } from "./csv";

/**
 * The expense list as a spreadsheet: the Cash book's Export CSV and the
 * owner's backup. Cancelled rows are included and say so — a backup that
 * dropped them would hide history.
 */
export function expensesCsv(rows: ExpenseRow[]): string {
  return toCsv(rows, [
    { header: "Date", value: (r) => r.expenseDate },
    { header: "Category", value: (r) => r.categoryName },
    { header: "Paid to", value: (r) => r.paidTo ?? "" },
    { header: "Note", value: (r) => r.note ?? "" },
    { header: "Mode", value: (r) => EXPENSE_MODE_LABELS[r.mode] },
    {
      header: "Group",
      value: (r) => CASH_GROUP_LABELS[expenseModeGroup(r.mode)],
    },
    { header: "Amount", value: (r) => csvAmount(r.amount) },
    {
      header: "Status",
      value: (r) => (r.cancelledAt ? "Cancelled" : "Active"),
    },
    { header: "Cancel reason", value: (r) => r.cancelReason ?? "" },
    { header: "Entered by", value: (r) => r.createdByName },
    { header: "Entered at", value: (r) => r.createdAt },
  ]);
}
