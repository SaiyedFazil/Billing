"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { useDebounce } from "@/hooks/use-debounce";
import { categoryTone } from "@/lib/utils/category-tone";
import { formatINR, parseRupees } from "@/lib/utils/money";
import {
  createItemAction,
  deleteItemAction,
  toggleItemAvailabilityAction,
  updateItemAction,
} from "@/server/items/items-actions";
import type { AdminItemRow } from "@/types/item.types";

export type ItemFormState = {
  id: string | null;
  name: string;
  categoryId: string;
  priceInput: string;
  imageUrl: string | null;
  imageFileId: string | null;
  isAvailable: boolean;
  sortOrder: string;
};

function emptyForm(categoryId: string): ItemFormState {
  return {
    id: null,
    name: "",
    categoryId,
    priceInput: "",
    imageUrl: null,
    imageFileId: null,
    isAvailable: true,
    sortOrder: "0",
  };
}

export function useItemsTab({
  items,
  categories,
}: {
  items: AdminItemRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const debouncedSearch = useDebounce(search);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ItemFormState>(() =>
    emptyForm(categories[0]?.id ?? ""),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<AdminItemRow | null>(null);

  const visibleItems = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "ALL" && item.categoryId !== categoryFilter) {
        return false;
      }
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.categoryName.toLowerCase().includes(term)
      );
    });
  }, [items, categoryFilter, debouncedSearch]);

  // Display only: the same tint per category as its tiles on the till.
  const toneByCategoryId = useMemo(
    () =>
      new Map(
        categories.map((category, index) => [category.id, categoryTone(index)]),
      ),
    [categories],
  );

  const openCreate = useCallback(() => {
    setForm(emptyForm(categories[0]?.id ?? ""));
    setFieldErrors({});
    setDialogOpen(true);
  }, [categories]);

  const openEdit = useCallback((row: AdminItemRow) => {
    setForm({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      // Already a rupee decimal string — nothing to convert.
      priceInput: row.price,
      imageUrl: row.imageUrl,
      imageFileId: row.imageFileId,
      isAvailable: row.isAvailable,
      sortOrder: String(row.sortOrder),
    });
    setFieldErrors({});
    setDialogOpen(true);
  }, []);

  const submit = useCallback(() => {
    setFieldErrors({});

    let price: string;
    try {
      price = parseRupees(form.priceInput || "0");
    } catch {
      setFieldErrors({ price: "Enter a valid amount, e.g. 60.50" });
      return;
    }

    startTransition(async () => {
      const payload = {
        name: form.name,
        categoryId: form.categoryId,
        price,
        imageUrl: form.imageUrl,
        imageFileId: form.imageFileId,
        isAvailable: form.isAvailable,
        sortOrder: Number(form.sortOrder) || 0,
      };

      const result = form.id
        ? await updateItemAction({ ...payload, id: form.id })
        : await createItemAction(payload);

      if (result.ok) {
        toast.success(
          form.id
            ? `Saved — ${form.name} is ${formatINR(price)}`
            : `Added ${form.name}`,
        );
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
      const result = await deleteItemAction({ id: target.id });
      if (result.ok) {
        toast.success(`“${target.name}” removed from the menu`);
      } else {
        toast.error(result.error.message);
      }
      setPendingDelete(null);
      router.refresh();
    });
  }, [pendingDelete, router]);

  const toggleAvailability = useCallback(
    (row: AdminItemRow) => {
      startTransition(async () => {
        const result = await toggleItemAvailabilityAction({
          id: row.id,
          isAvailable: !row.isAvailable,
        });
        if (result.ok) {
          toast.success(
            row.isAvailable
              ? `${row.name} marked sold out`
              : `${row.name} is back on`,
          );
          router.refresh();
        } else {
          toast.error(result.error.message);
        }
      });
    },
    [router],
  );

  return {
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    visibleItems,
    categories,
    toneByCategoryId,

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
    toggleAvailability,

    isPending,
  };
}
