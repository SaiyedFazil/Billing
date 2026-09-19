"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { collectsTender, type PaymentMethod } from "@/constants/payment-methods";
import {
  billTotal,
  compare,
  parseRupeesOrZero,
  subtract,
  ZERO,
} from "@/lib/utils/money";
import { categoryTone } from "@/lib/utils/category-tone";
import { createBillAction } from "@/server/bills/bills-actions";
import type { MenuCategory, MenuItem } from "@/types/item.types";

import { filterItems, topSearchMatch } from "../utils/cart";
import { useCartReducer } from "./useCartReducer";

export function useBillPage({ menu }: { menu: MenuCategory[] }) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  const { lines, addItem, setQuantity, removeItem, clear } = useCartReducer();

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<string | null>(null);

  // One key per cart. A retry after a failure REUSES it, so retrying cannot
  // create a second bill. Reset only after a successful save. See spec §8.4.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    globalThis.crypto.randomUUID(),
  );

  const visibleItems = useMemo(
    () => filterItems(menu, activeCategoryId, search),
    [menu, activeCategoryId, search],
  );

  // Display only: lets a menu card show "×2" once it is on the bill.
  const quantityByItemId = useMemo(
    () => new Map(lines.map((line) => [line.itemId, line.quantity])),
    [lines],
  );
  const toneByCategoryId = useMemo(
    () =>
      new Map(menu.map((category, index) => [category.id, categoryTone(index)])),
    [menu],
  );
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const rawDiscount = parseRupeesOrZero(discountInput);
  const { subtotal, discount, total } = billTotal(lines, rawDiscount);
  const discountExceedsSubtotal = compare(rawDiscount, subtotal) > 0;

  const tendered = collectsTender(paymentMethod)
    ? parseRupeesOrZero(tenderedInput)
    : null;
  const changeDue =
    tendered !== null && tenderedInput.trim() && compare(tendered, total) >= 0
      ? subtract(tendered, total)
      : null;

  const canSave =
    lines.length > 0 &&
    !discountExceedsSubtotal &&
    !isSaving &&
    (!collectsTender(paymentMethod) ||
      !tenderedInput.trim() ||
      compare(tendered ?? ZERO, total) >= 0);

  const addBySearch = useCallback(() => {
    const match = topSearchMatch(menu, search);
    if (!match) return;
    addItem(match);
    setSearch("");
  }, [addItem, menu, search]);

  const resetForNextCustomer = useCallback(() => {
    clear();
    setDiscountInput("");
    setTenderedInput("");
    setPaymentMethod("CASH");
    setSearch("");
    setError(null);
    setPriceChange(null);
    setIdempotencyKey(globalThis.crypto.randomUUID());
  }, [clear]);

  const submit = useCallback(
    (expectedTotal: string) => {
      setError(null);

      startSaving(async () => {
        const result = await createBillAction({
          idempotencyKey,
          lines: lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
          })),
          discount,
          paymentMethod,
          tendered:
            collectsTender(paymentMethod) && tenderedInput.trim()
              ? tendered
              : null,
          expectedTotal,
        });

        if (result.ok) {
          const { id, billNumber } = result.data;
          toast.success(`Bill #${billNumber} saved`);
          resetForNextCustomer();
          router.push(`/print/${id}`);
          return;
        }

        if (result.error.code === "PRICE_CHANGED") {
          setPriceChange(result.error.message);
          return;
        }

        setError(result.error.message);
      });
    },
    [
      discount,
      idempotencyKey,
      lines,
      paymentMethod,
      resetForNextCustomer,
      router,
      tendered,
      tenderedInput,
    ],
  );

  const save = useCallback(() => submit(total), [submit, total]);

  /**
   * The cashier accepted the recalculated total. Re-submitting with the same
   * idempotency key is safe — the rejected attempt never wrote anything.
   */
  const confirmPriceChange = useCallback(() => {
    setPriceChange(null);
    // Pull fresh prices into the menu for the next customer.
    router.refresh();
    submit(total);
  }, [router, submit, total]);

  const dismissPriceChange = useCallback(() => setPriceChange(null), []);

  return {
    categories: menu,
    activeCategoryId,
    setActiveCategoryId,
    search,
    setSearch,
    addBySearch,
    visibleItems,
    quantityByItemId,
    toneByCategoryId,

    lines,
    itemCount,
    addItem: (item: MenuItem) => addItem(item),
    setQuantity,
    removeItem,

    subtotal,
    discountInput,
    setDiscountInput,
    discount,
    discountExceedsSubtotal,
    total,

    paymentMethod,
    setPaymentMethod,
    tenderedInput,
    setTenderedInput,
    changeDue,

    canSave,
    isSaving,
    error,
    priceChange,
    confirmPriceChange,
    dismissPriceChange,
    save,
  };
}
