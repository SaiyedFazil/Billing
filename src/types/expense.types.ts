import type { ExpenseMode } from "@/constants/expense-modes";

/** One expense as the Cash book lists it. Amounts are rupee strings. */
export type ExpenseRow = {
  id: string;
  expenseDate: string;
  amount: string;
  mode: ExpenseMode;
  categoryId: string;
  categoryName: string;
  /** False once the category is retired; the expense keeps its name. */
  categoryIsActive: boolean;
  paidTo: string | null;
  note: string | null;
  createdByName: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Changed at least once after it was added. */
  edited: boolean;
  /** ISO timestamp, or null while the expense still counts. */
  cancelledAt: string | null;
  cancelReason: string | null;
};

export type ExpenseCategoryRow = { id: string; name: string };

export type CategorySpendRow = {
  categoryId: string;
  name: string;
  total: string;
  /** A display percentage for the share bar; never summed back into money. */
  sharePercent: number;
};

export type ExpenseListFilters = {
  from: string;
  to: string;
  group?: "CASH" | "ONLINE";
  categoryId?: string;
};

export type ExpensePage = {
  rows: ExpenseRow[];
  total: number;
  page: number;
  pageSize: number;
};
