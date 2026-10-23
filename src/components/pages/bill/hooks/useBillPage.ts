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
  type BillPaymentMethod,
  collectsTender,
  type PaymentMethod,
  SPLIT,
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
import {
  type PendingPriceChange,
  priceChangeStep,
} from "../utils/price-change";
import { canSplit, splitPayload } from "../utils/split-payment";
import { useCartReducer } from "./useCartReducer";
import { useSplitPayment } from "./useSplitPayment";

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

  // A fresh menu (after a refresh, or a failed save) may hold less stock or
  // different prices than the cart: bring the cart to it and say so, rather
  // than let the cashier re-submit a bill the server will refuse.
  useEffect(() => {
    const { changed, repriced } = syncMenu(menu);
    if (changed.length > 0) {
      toast.warning(`Updated to current stock: ${changed.join(", ")}`);
    }
    if (repriced.length > 0) {
      toast(`Prices updated: ${repriced.join(", ")}`);
    }
  }, [menu, syncMenu]);

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");
  // The owner chooses which methods the till offers; the first enabled one is
  // the default. getEnabledPaymentMethods() never returns an empty list.
  const defaultMethod = paymentMethods[0];
  const [selectedMethod, setSelectedMethod] =
    useState<BillPaymentMethod>(defaultMethod);
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<PendingPriceChange | null>(
    null,
  );

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

  // Splitting needs two methods and something to split (a ₹0 bill has none).
  const showSplit = paymentMethods.length >= 2;
  const splitAvailable = canSplit(paymentMethods, total);
  const split = useSplitPayment({ paymentMethods, total });
  const { start: startSplitPayment, reset: resetSplit } = split;

  // SPLIT only while a split really is on screen. Otherwise, if the owner
  // switches off the selected method while this till is open, a refresh drops
  // it from the list — fall back rather than leave a button highlighted that
  // is no longer there (the same goes for a split left with fewer than two
  // methods, or on a ₹0 bill). The server rejects it either way. The stale
  // split state is cleared by the cashier's next tap on a method.
  const paymentMethod: BillPaymentMethod =
    selectedMethod === SPLIT
      ? splitAvailable && split.active
        ? SPLIT
        : defaultMethod
      : paymentMethods.includes(selectedMethod)
        ? selectedMethod
        : defaultMethod;
  const splitting = paymentMethod === SPLIT;

  // Cash given on a split goes with the cash line, so it is read apart from
  // the one-method "Tendered" field.
  const cashTendered = !splitting && collectsTender(paymentMethod);
  const tendered = cashTendered ? parseRupeesOrZero(tenderedInput) : null;
  const changeDue =
    tendered !== null && tenderedInput.trim() && compare(tendered, total) >= 0
      ? subtract(tendered, total)
      : null;

  const canSave =
    lines.length > 0 &&
    !discountExceedsSubtotal &&
    !isSaving &&
    (splitting
      ? split.status.kind === "PAID"
      : !cashTendered ||
        !tenderedInput.trim() ||
        compare(tendered ?? ZERO, total) >= 0);

  // Tapping Split starts a split (and keeps one already on screen); tapping
  // any real method leaves it and discards the lines.
  const setPaymentMethod = useCallback(
    (method: BillPaymentMethod) => {
      if (method === SPLIT) {
        if (!splitting) startSplitPayment();
      } else {
        resetSplit();
      }
      setSelectedMethod(method);
    },
    [resetSplit, startSplitPayment, splitting],
  );

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
    setSelectedMethod(defaultMethod);
    resetSplit();
    setSearch("");
    setError(null);
    setPriceChange(null);
    setIdempotencyKey(globalThis.crypto.randomUUID());
  }, [clear, defaultMethod, resetSplit]);

  // Cash given is optional: null means none was entered (or no cash line).
  const splitTendered =
    split.hasCashLine && split.cashGivenInput.trim()
      ? parseRupeesOrZero(split.cashGivenInput)
      : null;

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
          tendered: splitting
            ? splitTendered
            : cashTendered && tenderedInput.trim()
              ? tendered
              : null,
          // The one-method payload carries no `splitPayments` key at all.
          ...(splitting ? { splitPayments: splitPayload(split.lines) } : {}),
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
          // Remember the menu we hold now; the refresh brings a different one,
          // and the dialog stays on "Updating prices…" until it does.
          setPriceChange({
            message: result.error.message,
            newTotal: result.error.fields?.total ?? null,
            menu,
          });
          router.refresh();
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
      cashTendered,
      discount,
      idempotencyKey,
      lines,
      menu,
      paymentMethod,
      resetForNextCustomer,
      router,
      split.lines,
      splitTendered,
      splitting,
      tendered,
      tenderedInput,
    ],
  );

  const save = useCallback(() => submit(total), [submit, total]);

  // What the dialog may offer: the bill must have caught up with the refreshed
  // menu and reach exactly the server's new total.
  const priceChangeState = useMemo(
    () =>
      priceChange
        ? priceChangeStep(priceChange, menu, lines, rawDiscount)
        : null,
    [priceChange, menu, lines, rawDiscount],
  );

  /**
   * The cashier accepted the recalculated total. Only once the till has
   * re-priced the bill to it (READY) — before that, `total` is the old one and
   * would be refused again. Re-submitting with the same idempotency key is
   * safe: the rejected attempt never wrote anything.
   */
  const confirmPriceChange = useCallback(() => {
    if (priceChangeState !== "READY" || !priceChange) return;
    setPriceChange(null);
    // A split re-balanced itself to the new total: the cashier checks what
    // each method now owes and presses Save (spec §9.4).
    if (splitting) return;
    // `READY` was worked out from the menu; `total` is what is on screen. Charge
    // only when the two agree, so a stale total can never be sent.
    if (
      priceChange.newTotal === null ||
      compare(total, priceChange.newTotal) !== 0
    ) {
      return;
    }
    submit(total);
  }, [priceChange, priceChangeState, splitting, submit, total]);

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
    showSplit,
    splitAvailable,
    split,
    tenderedInput,
    setTenderedInput,
    changeDue,

    canSave,
    isSaving,
    error,
    priceChange: priceChange?.message ?? null,
    priceChangeStep: priceChangeState,
    confirmPriceChange,
    dismissPriceChange,
    save,
  };
}
