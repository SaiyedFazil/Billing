"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createExpenseCategoryAction,
  retireExpenseCategoryAction,
  updateExpenseCategoryAction,
} from "@/server/expenses/expenses-actions";
import type { ExpenseCategoryRow } from "@/types/expense.types";

/** Field errors are keyed "new" for the add row, or by the category's id. */
export function useExpenseCategories() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingRetire, setPendingRetire] = useState<ExpenseCategoryRow | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const add = useCallback(() => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createExpenseCategoryAction({ name: newName });
      if (result.ok) {
        toast.success(`“${newName.trim()}” added`);
        setNewName("");
        router.refresh();
        return;
      }
      setFieldErrors({
        new: result.error.fields?.name ?? result.error.message,
      });
    });
  }, [newName, router]);

  const startRename = useCallback((row: ExpenseCategoryRow) => {
    setRenamingId(row.id);
    setRenameValue(row.name);
    setFieldErrors({});
  }, []);

  const cancelRename = useCallback(() => setRenamingId(null), []);

  const saveRename = useCallback(() => {
    if (!renamingId) return;
    const id = renamingId;
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateExpenseCategoryAction({
        id,
        name: renameValue,
      });
      if (result.ok) {
        toast.success("Category renamed");
        setRenamingId(null);
        router.refresh();
        return;
      }
      if (result.error.code === "NOT_FOUND") {
        toast.error(result.error.message);
        setRenamingId(null);
        router.refresh();
        return;
      }
      setFieldErrors({
        [id]: result.error.fields?.name ?? result.error.message,
      });
    });
  }, [renameValue, renamingId, router]);

  const askRetire = useCallback(
    (row: ExpenseCategoryRow) => setPendingRetire(row),
    [],
  );

  const cancelRetire = useCallback(() => setPendingRetire(null), []);

  const confirmRetire = useCallback(() => {
    if (!pendingRetire) return;
    const target = pendingRetire;
    startTransition(async () => {
      const result = await retireExpenseCategoryAction({ id: target.id });
      if (result.ok) toast.success(`“${target.name}” retired`);
      else toast.error(result.error.message);
      setPendingRetire(null);
      router.refresh();
    });
  }, [pendingRetire, router]);

  return {
    open,
    setOpen,
    isPending,
    newName,
    setNewName,
    add,
    renamingId,
    renameValue,
    setRenameValue,
    startRename,
    cancelRename,
    saveRename,
    pendingRetire,
    askRetire,
    cancelRetire,
    confirmRetire,
    fieldErrors,
  };
}
