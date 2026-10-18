"use client";

import { useCallback, useReducer } from "react";

import { maxSellable } from "@/lib/utils/stock";
import { MAX_LINE_QUANTITY } from "@/lib/validation/bill-schema";
import type { CartLine } from "@/types/bill.types";
import type { MenuItem } from "@/types/item.types";

type CartAction =
  | { type: "ADD"; item: MenuItem }
  | { type: "SET_QUANTITY"; itemId: string; quantity: number }
  | { type: "REMOVE"; itemId: string }
  | { type: "CLEAR" };

function reducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "ADD": {
      const existing = state.find((line) => line.itemId === action.item.id);
      if (existing) {
        if (existing.quantity >= MAX_LINE_QUANTITY) return state;
        return state.map((line) =>
          line.itemId === action.item.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [
        ...state,
        {
          itemId: action.item.id,
          name: action.item.name,
          unitPrice: action.item.price,
          quantity: 1,
          maxQuantity: maxSellable(action.item),
        },
      ];
    }
    case "SET_QUANTITY": {
      // Stepping below 1 removes the line — a cashier pressing "−" past zero
      // means "take this off the bill".
      if (action.quantity <= 0) {
        return state.filter((line) => line.itemId !== action.itemId);
      }
      const quantity = Math.min(action.quantity, MAX_LINE_QUANTITY);
      return state.map((line) =>
        line.itemId === action.itemId ? { ...line, quantity } : line,
      );
    }
    case "REMOVE":
      return state.filter((line) => line.itemId !== action.itemId);
    case "CLEAR":
      return [];
  }
}

/**
 * The cart lives entirely in client state until Save & Print. No draft rows,
 * no abandoned-cart cleanup, no locking. See spec §8.1.
 */
export function useCartReducer() {
  const [lines, dispatch] = useReducer(reducer, []);

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

  return { lines, addItem, setQuantity, removeItem, clear };
}
