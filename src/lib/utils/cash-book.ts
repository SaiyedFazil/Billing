import type { ExpenseMode } from "@/constants/expense-modes";
import type { PaymentMethod } from "@/constants/payment-methods";

import { add, subtract, ZERO } from "./money";

/**
 * Cash book maths: which rupees count as cash and which as online, and the
 * per-day and range totals built from them. Pure — the expense dialog bundles
 * this, so it must stay free of server imports.
 *
 * The range summary is derived from the day rows, never queried separately,
 * so the KPI cards always equal the Day by day totals.
 */

/** "Other" exists only for bills: the till can't know how it was paid. */
export type CashGroup = "CASH" | "ONLINE" | "OTHER";

export const CASH_GROUP_LABELS: Record<CashGroup, string> = {
  CASH: "Cash",
  ONLINE: "Online",
  OTHER: "Other",
};

/** One expense may be at most ₹10,00,000 — a typo guard, not a business rule. */
export const MAX_EXPENSE = "1000000.00";

export function expenseModeGroup(mode: ExpenseMode): "CASH" | "ONLINE" {
  return mode === "CASH" ? "CASH" : "ONLINE";
}

export function billMethodGroup(method: PaymentMethod): CashGroup {
  if (method === "CASH") return "CASH";
  if (method === "OTHER") return "OTHER";
  return "ONLINE";
}

export type CashSplit = {
  cash: string;
  online: string;
  other: string;
  total: string;
};

export type CashBookDay = {
  date: string;
  inCash: string;
  inOnline: string;
  inOther: string;
  outCash: string;
  outOnline: string;
  net: string;
};

export type CashBookSummary = {
  moneyIn: CashSplit;
  moneyOut: CashSplit;
  net: CashSplit;
};

export type BillDayTotal = {
  date: string;
  paymentMethod: PaymentMethod;
  total: string;
};

export type ExpenseDayTotal = {
  date: string;
  mode: ExpenseMode;
  total: string;
};

function emptyDay(date: string): CashBookDay {
  return {
    date,
    inCash: ZERO,
    inOnline: ZERO,
    inOther: ZERO,
    outCash: ZERO,
    outOnline: ZERO,
    net: ZERO,
  };
}

/** One row per date that had a bill or an expense, newest first. */
export function buildCashBookDays(
  bills: BillDayTotal[],
  expenses: ExpenseDayTotal[],
): CashBookDay[] {
  const days = new Map<string, CashBookDay>();
  const dayFor = (date: string) => {
    let day = days.get(date);
    if (!day) {
      day = emptyDay(date);
      days.set(date, day);
    }
    return day;
  };

  for (const bill of bills) {
    const day = dayFor(bill.date);
    const group = billMethodGroup(bill.paymentMethod);
    if (group === "CASH") day.inCash = add(day.inCash, bill.total);
    else if (group === "ONLINE") day.inOnline = add(day.inOnline, bill.total);
    else day.inOther = add(day.inOther, bill.total);
  }

  for (const expense of expenses) {
    const day = dayFor(expense.date);
    if (expenseModeGroup(expense.mode) === "CASH") {
      day.outCash = add(day.outCash, expense.total);
    } else {
      day.outOnline = add(day.outOnline, expense.total);
    }
  }

  for (const day of days.values()) {
    const moneyIn = add(add(day.inCash, day.inOnline), day.inOther);
    day.net = subtract(subtract(moneyIn, day.outCash), day.outOnline);
  }

  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
}

function split(cash: string, online: string, other: string): CashSplit {
  return { cash, online, other, total: add(add(cash, online), other) };
}

export function summarizeCashBook(days: CashBookDay[]): CashBookSummary {
  let inCash = ZERO;
  let inOnline = ZERO;
  let inOther = ZERO;
  let outCash = ZERO;
  let outOnline = ZERO;

  for (const day of days) {
    inCash = add(inCash, day.inCash);
    inOnline = add(inOnline, day.inOnline);
    inOther = add(inOther, day.inOther);
    outCash = add(outCash, day.outCash);
    outOnline = add(outOnline, day.outOnline);
  }

  return {
    moneyIn: split(inCash, inOnline, inOther),
    moneyOut: split(outCash, outOnline, ZERO),
    net: split(
      subtract(inCash, outCash),
      subtract(inOnline, outOnline),
      inOther,
    ),
  };
}

/** Both are shop-local YYYY-MM-DD strings, which compare correctly as text. */
export function isFutureDate(isoDate: string, todayIso: string): boolean {
  return isoDate > todayIso;
}
