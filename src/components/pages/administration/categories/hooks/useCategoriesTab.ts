"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/server/categories/categories-actions";
import type { CategoryRow } from "@/types/category.types";

export type CategoryFormState = {
  id: string | null;
  name: string;
  sortOrder: string;
};

const EMPTY_FORM: CategoryFormState = { id: null, name: "", sortOrder: "0" };

export function useCategoriesTab() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<CategoryRow | null>(null);

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((row: CategoryRow) => {
    setForm({ id: row.id, name: row.name, sortOrder: String(row.sortOrder) });
    setFieldErrors({});
    setDialogOpen(true);
  }, []);

  const submit = useCallback(() => {
    setFieldErrors({});

    startTransition(async () => {
      const payload = {
        name: form.name,
        sortOrder: Number(form.sortOrder) || 0,
      };

      const result = form.id
        ? await updateCategoryAction({ ...payload, id: form.id })
        : await createCategoryAction(payload);

      if (result.ok) {
        toast.success(form.id ? "Category updated" : "Category created");
        setDialogOpen(false);
        router.refresh();
        return;
      }

      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const target = pendingDelete;

    startTransition(async () => {
      const result = await deleteCategoryAction({ id: target.id });
      if (result.ok) {
        toast.success(`“${target.name}” removed`);
      } else {
        toast.error(result.error.message);
      }
      setPendingDelete(null);
      router.refresh();
    });
  }, [pendingDelete, router]);

  return {
    isPending,
    dialogOpen,
    setDialogOpen,
    form,
    setForm,
    fieldErrors,
    openCreate,
    openEdit,
    submit,
    pendingDelete,
    setPendingDelete,
    confirmDelete,
  };
}
