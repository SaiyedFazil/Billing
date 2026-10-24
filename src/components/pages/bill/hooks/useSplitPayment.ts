"use client";

import { useCallback, useState } from "react";

import type { PaymentMethod } from "@/constants/payment-methods";

import {
  addSplitLine,
  keepEnabledLines,
  methodsToAdd,
  removeSplitLine,
  type ResolvedSplitLine,
  resolveSplit,
  type SplitLine,
  type SplitStatus,
  splitStatus,
  startSplit,
  typeSplitAmount,
} from "../utils/split-payment";

export type SplitPaymentState = {
  /** The lines with their amounts worked out; empty when not splitting. */
  lines: ResolvedSplitLine[];
  /** Only meaningful while `active`. */
  status: SplitStatus;
  /** Enabled methods that have no line yet. */
  addable: PaymentMethod[];
  cashGivenInput: string;
  hasCashLine: boolean;
  /** True when there are two or more lines on enabled methods. */
  active: boolean;
  /**
   * What a line's field shows: the auto line its worked-out amount, a typed
   * line exactly what was typed (so "400." survives mid-keystroke).
   */
  fieldValue: (method: PaymentMethod) => string;
  start: () => void;
  reset: () => void;
  add: (method: PaymentMethod) => void;
  remove: (method: PaymentMethod) => void;
  setAmount: (method: PaymentMethod, value: string) => void;
  setCashGiven: (value: string) => void;
};

/**
 * The split's state. Only the raw lines and the cash-given text are stored;
 * the worked-out amounts and the status are derived on every render, so a
 * discount or cart change re-balances "the rest" by itself.
 */
export function useSplitPayment({
  paymentMethods,
  total,
}: {
  paymentMethods: PaymentMethod[];
  total: string;
}): SplitPaymentState {
  const [rawLines, setRawLines] = useState<SplitLine[]>([]);
  const [cashGivenInput, setCashGivenInput] = useState("");

  // A refresh can switch a method off under a split on screen: drop its line,
  // and with fewer than two left (or none, when not splitting), report "not
  // active" so the caller falls back to one method. The other lines are kept
  // exactly as they are, typed amounts and "the rest" alike.
  const kept: SplitLine[] | null = keepEnabledLines(rawLines, paymentMethods);

  const resolved = kept ? resolveSplit(kept, total) : [];
  const status = splitStatus(resolved, total, cashGivenInput);
  const addable = kept ? methodsToAdd(kept, paymentMethods) : [];
  const hasCashLine = resolved.some((line) => line.method === "CASH");

  const fieldValue = (method: PaymentMethod) => {
    const line = kept?.find((candidate) => candidate.method === method);
    const worked = resolved.find((candidate) => candidate.method === method);
    if (!line || !worked) return "";
    return line.auto ? worked.amount : line.amountInput;
  };

  const start = useCallback(() => {
    // Callers check `canSplit` for the amount; this guards the method count.
    setRawLines(startSplit(paymentMethods));
    setCashGivenInput("");
  }, [paymentMethods]);

  const reset = useCallback(() => {
    setRawLines([]);
    setCashGivenInput("");
  }, []);

  // The actions edit `kept`, not `rawLines`, so a line on a disabled method
  // is dropped for good by the cashier's next touch.
  const add = (method: PaymentMethod) => {
    if (kept) setRawLines(addSplitLine(kept, method, total));
  };

  const remove = (method: PaymentMethod) => {
    if (!kept) return;
    const next = removeSplitLine(kept, method);
    setRawLines(next);
    // No cash line, nothing was handed over.
    if (method === "CASH" && next.length < kept.length) setCashGivenInput("");
  };

  const setAmount = (method: PaymentMethod, value: string) => {
    if (kept) setRawLines(typeSplitAmount(kept, method, value));
  };

  return {
    lines: resolved,
    status,
    addable,
    cashGivenInput,
    hasCashLine,
    active: kept !== null,
    fieldValue,
    start,
    reset,
    add,
    remove,
    setAmount,
    setCashGiven: setCashGivenInput,
  };
}
