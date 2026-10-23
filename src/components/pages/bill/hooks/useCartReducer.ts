"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import { maxSellable } from "@/lib/utils/stock";
import type { CartLine } from "@/types/bill.types";
import type { MenuCategory, MenuItem } from "@/types/item.types";

import { clampLinesToMenu } from "../utils/cart";

type CartAction =
  | { type: "ADD"; item: MenuItem }
  | { type: "SET_QUANTITY"; itemId: string; quantity: number }
  | { type: "REMOVE"; itemId: string }
  | { type: "CLEAR" }
  | { type: "SYNC_MENU"; menu: MenuCategory[] };

/** Exported for scripts/verify-stock-utils.ts. */
export function cartReducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "ADD": {
      // The card knows the stock as of this page load; the server re-checks.
      const maxQuantity = maxSellable(action.item);
      const existing = state.find((line) => line.itemId === action.item.id);
      if (existing) {
        if (existing.quantity >= maxQuantity) return state;
        return state.map((line) =>
          line.itemId === action.item.id
            ? { ...line, quantity: line.quantity + 1, maxQuantity }
            : line,
        );
      }
      if (maxQuantity < 1) return state;
      return [
        ...state,
        {
          itemId: action.item.id,
          name: action.item.name,
          unitPrice: action.item.price,
          quantity: 1,
          maxQuantity,
        },
      ];
    }
    case "SET_QUANTITY": {
      // Stepping below 1 removes the line — a cashier pressing "−" past zero
      // means "take this off the bill".
      if (action.quantity <= 0) {
        return state.filter((line) => line.itemId !== action.itemId);
      }
      return state.map((line) =>
        line.itemId === action.itemId
          ? { ...line, quantity: Math.min(action.quantity, line.maxQuantity) }
          : line,
      );
    }
    case "REMOVE":
      return state.filter((line) => line.itemId !== action.itemId);
    case "CLEAR":
      return [];
    case "SYNC_MENU":
      return clampLinesToMenu(state, action.menu).lines;
  }
}

/**
 * The cart lives entirely in client state until Save & Print. No draft rows,
 * no abandoned-cart cleanup, no locking. See spec §8.1.
 */
export function useCartReducer() {
  const [lines, dispatch] = useReducer(cartReducer, []);

  // syncMenu runs from an effect, after render; it needs the latest lines.
  const linesRef = useRef(lines);
  useEffect(() => {
    linesRef.current = lines;
  });

  const addItem = useCallback((item: MenuItem) => {
    dispatch({ type: "ADD", item });
  }, []);

  const setQuantity = useCallback((itemId: string, quantity: number) => {
    dispatch({ type: "SET_QUANTITY", itemId, quantity });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    dispatch({ type: "REMOVE", itemId });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  /**
   * Re-applies a freshly loaded menu to the cart. Returns the names of the
   * lines it cut down or removed (`changed`) and of those it re-priced
   * (`repriced`), so the till can tell the cashier.
   */
  const syncMenu = useCallback(
    (menu: MenuCategory[]): { changed: string[]; repriced: string[] } => {
      const { changed, repriced } = clampLinesToMenu(linesRef.current, menu);
      if (changed.length > 0 || repriced.length > 0) {
        dispatch({ type: "SYNC_MENU", menu });
      }
      return { changed, repriced };
    },
    [],
  );

  return { lines, addItem, setQuantity, removeItem, clear, syncMenu };
}
