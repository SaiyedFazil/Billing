"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import {
  collectsTender,
  type PaymentMethod,
} from "@/constants/payment-methods";
import {
  billTotal,
  compare,
  parseRupeesOrZero,
  subtract,
  ZERO,
} from "@/lib/utils/money";
import { categoryTone } from "@/lib/utils/category-tone";
import { MAX_LINE_QUANTITY } from "@/lib/validation/bill-schema";
import { createBillAction } from "@/server/bills/bills-actions";
import type { MenuCategory, MenuItem } from "@/types/item.types";

import { atStockCap, filterItems, topSearchMatch } from "../utils/cart";
import { useCartReducer } from "./useCartReducer";

export function useBillPage({
  menu,
  paymentMethods,
}: {
  menu: MenuCategory[];
  paymentMethods: PaymentMethod[];
}) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  const {
    lines,
    addItem: addToCart,
    setQuantity: setCartQuantity,
    removeItem,
    clear,
    syncMenu,
  } = useCartReducer();

  // A fresh menu (after a refresh, or a failed save) may hold less stock than
  // the cart: cut the cart down to it and say so, rather than let the cashier
  // re-submit a bill the server will refuse.
  useEffect(() => {
    const changed = syncMenu(menu);
    if (changed.length > 0) {
      toast.warning(`Updated to current stock: ${changed.join(", ")}`);
    }
  }, [menu, syncMenu]);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");
  // The owner chooses which methods the till offers; the first enabled one is
  // the default. getEnabledPaymentMethods() never returns an empty list.
  const defaultMethod = paymentMethods[0];
  const [selectedMethod, setPaymentMethod] =
    useState<PaymentMethod>(defaultMethod);
  // If the owner switches off the selected method while this till is open, a
  // refresh drops it from the list — fall back rather than leave a button
  // highlighted that is no longer there. The server rejects it either way.
  const paymentMethod = paymentMethods.includes(selectedMethod)
    ? selectedMethod
    : defaultMethod;
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
      new Map(
        menu.map((category, index) => [category.id, categoryTone(index)]),
      ),
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

  const addItem = useCallback(
    (item: MenuItem) => {
      const inCart = lines.find((line) => line.itemId === item.id);
      if (atStockCap(item, inCart?.quantity ?? 0)) {
        toast(`Only ${item.stockQuantity} ${item.name} in stock`);
        return;
      }
      addToCart(item);
    },
    [addToCart, lines],
  );

  const setQuantity = useCallback(
    (itemId: string, quantity: number) => {
      const line = lines.find((candidate) => candidate.itemId === itemId);
      if (
        line &&
        quantity > line.maxQuantity &&
        line.maxQuantity < MAX_LINE_QUANTITY
      ) {
        toast(`Only ${line.maxQuantity} ${line.name} in stock`);
      }
      setCartQuantity(itemId, quantity);
    },
    [lines, setCartQuantity],
  );

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
    setPaymentMethod(defaultMethod);
    setSearch("");
    setError(null);
    setPriceChange(null);
    setIdempotencyKey(globalThis.crypto.randomUUID());
  }, [clear, defaultMethod]);

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

        if (result.error.code === "OUT_OF_STOCK") {
          // Pull the real counts; the effect above then trims the cart.
          setError(result.error.message);
          router.refresh();
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
    addItem,
    setQuantity,
    removeItem,

    subtotal,
    discountInput,
    setDiscountInput,
    discount,
    discountExceedsSubtotal,
    total,

    paymentMethods,
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
