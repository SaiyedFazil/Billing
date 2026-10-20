"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import type { OnlineExpenseMode } from "@/constants/expense-modes";
import { expenseModeGroup } from "@/lib/utils/cash-book";
import {
  createExpenseAction,
  updateExpenseAction,
} from "@/server/expenses/expenses-actions";
import type { ExpenseCategoryRow, ExpenseRow } from "@/types/expense.types";

export type ExpenseFormState = {
  id: string | null;
  idempotencyKey: string;
  amount: string;
  group: "CASH" | "ONLINE";
  onlineMode: OnlineExpenseMode;
  categoryId: string;
  expenseDate: string;
  paidTo: string;
  note: string;
};

function blankForm(today: string): ExpenseFormState {
  return {
    id: null,
    idempotencyKey: "",
    amount: "",
    group: "CASH",
    onlineMode: "UPI",
    categoryId: "",
    expenseDate: today,
    paidTo: "",
    note: "",
  };
}

export function useExpenseForm({
  today,
  categories,
}: {
  today: string;
  categories: ExpenseCategoryRow[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(() => blankForm(today));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // An old expense may sit in a category retired since; it stays selectable
  // for that expense only.
  const [retiredCategory, setRetiredCategory] =
    useState<ExpenseCategoryRow | null>(null);

  const categoryOptions = useMemo(
    () =>
      retiredCategory
        ? [
            ...categories,
            {
              id: retiredCategory.id,
              name: `${retiredCategory.name} (retired)`,
            },
          ]
        : categories,
    [categories, retiredCategory],
  );

  const setField = useCallback(
    <K extends keyof ExpenseFormState>(key: K, value: ExpenseFormState[K]) =>
      setForm((current) => ({ ...current, [key]: value })),
    [],
  );

  const openCreate = useCallback(() => {
    // One key per dialog opening: a retry of this save — a double tap, a
    // dropped connection — returns the first expense instead of adding two.
    setForm({ ...blankForm(today), idempotencyKey: crypto.randomUUID() });
    setRetiredCategory(null);
    setFieldErrors({});
    setOpen(true);
  }, [today]);

  const openEdit = useCallback((row: ExpenseRow) => {
    setForm({
      id: row.id,
      idempotencyKey: "",
      amount: row.amount,
      group: expenseModeGroup(row.mode),
      onlineMode: row.mode === "CASH" ? "UPI" : row.mode,
      categoryId: row.categoryId,
      expenseDate: row.expenseDate,
      paidTo: row.paidTo ?? "",
      note: row.note ?? "",
    });
    setRetiredCategory(
      row.categoryIsActive
        ? null
        : { id: row.categoryId, name: row.categoryName },
    );
    setFieldErrors({});
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const submit = useCallback(() => {
    setFieldErrors({});

    startTransition(async () => {
      const values = {
        expenseDate: form.expenseDate,
        amount: form.amount,
        mode: form.group === "CASH" ? "CASH" : form.onlineMode,
        categoryId: form.categoryId,
        paidTo: form.paidTo,
        note: form.note,
      };

      const result = form.id
        ? await updateExpenseAction({ ...values, id: form.id })
        : await createExpenseAction({
            ...values,
            idempotencyKey: form.idempotencyKey,
          });

      if (result.ok) {
        toast.success(form.id ? "Expense updated" : "Expense added");
        setOpen(false);
        router.refresh();
        return;
      }

      toast.error(result.error.message);
      // Cancelled or gone in another tab: nothing left to edit here.
      if (
        result.error.code === "CONFLICT" ||
        result.error.code === "NOT_FOUND"
      ) {
        setOpen(false);
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
    });
  }, [form, router]);

  return {
    open,
    form,
    setField,
    fieldErrors,
    isPending,
    categoryOptions,
    openCreate,
    openEdit,
    submit,
    close,
  };
}
