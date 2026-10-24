import {
  type BillPaymentMethod,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  SPLIT,
} from "@/constants/payment-methods";
import {
  add,
  compare,
  formatINR,
  isZero,
  parseRupeesOrZero,
  subtract,
  ZERO,
} from "@/lib/utils/money";
import type { SplitPaymentInput } from "@/lib/utils/bill-payments";
import type { CartLine } from "@/types/bill.types";

/**
 * The till's split-payment maths, kept pure so it can be checked without a
 * browser. The hook in Task 5 holds the lines in state and calls these.
 *
 * A split is a list of lines, one per method. At most one line is `auto`: it
 * is "the rest", whatever the typed lines leave of the total. Because it is
 * derived, it follows a discount or a cart change by itself; a typed line
 * never does, so the status turns to "Collect more" or "too much" instead of
 * the till quietly changing what the cashier typed.
 */

/** A line as the cashier sees it: the raw text in the field, not a number. */
export type SplitLine = {
  method: PaymentMethod;
  amountInput: string;
  auto: boolean;
};

/** A line with its amount worked out, as an exact rupee string. */
export type ResolvedSplitLine = {
  method: PaymentMethod;
  amount: string;
  auto: boolean;
};

export type SplitStatus =
  | { kind: "PAID"; change: string | null }
  | { kind: "SHORT"; amount: string }
  | { kind: "OVER"; amount: string }
  | { kind: "ZERO_LINE"; method: PaymentMethod }
  | { kind: "SINGLE_METHOD"; method: PaymentMethod }
  | { kind: "CASH_GIVEN_SHORT"; cashAmount: string };

/** Splitting needs two methods to split between, and something to split. */
export function canSplit(
  enabled: readonly PaymentMethod[],
  total: string,
): boolean {
  return enabled.length >= 2 && compare(total, ZERO) > 0;
}

/**
 * True when an item added now is the first of a new order and the last order
 * left a split behind (Split selected, or split lines kept), so the till drops
 * it first. An abandoned order (every item removed) keeps its split until
 * then, and it must not come back for the next customer.
 *
 * A real method tapped before the first item is this customer's choice and
 * stays, exactly as before splits existed. Only an empty cart counts: a ₹0
 * total does not, as a discount being typed can briefly equal the subtotal.
 */
export function dropsLeftoverSplit(
  cart: readonly CartLine[],
  selectedMethod: BillPaymentMethod,
  splitLineCount: number,
): boolean {
  return cart.length === 0 && (selectedMethod === SPLIT || splitLineCount > 0);
}

/**
 * Two lines to begin with: Cash typed first (it is the one that takes change),
 * then the first other method as "the rest". Without Cash, the first enabled
 * method leads. Callers check `canSplit` first, so two methods exist.
 */
export function startSplit(enabled: readonly PaymentMethod[]): SplitLine[] {
  const first = enabled.includes("CASH") ? "CASH" : enabled[0];
  const second = enabled.find((method) => method !== first);
  if (!second) return [];
  return [
    { method: first, amountInput: "", auto: false },
    { method: second, amountInput: "", auto: true },
  ];
}

/**
 * Works out every line's amount. A blank or junk field is ₹0, so a half-typed
 * row never throws. The auto line takes what is left, and never goes below 0:
 * when the typed lines overshoot, the status reports OVER instead.
 */
export function resolveSplit(
  lines: SplitLine[],
  total: string,
): ResolvedSplitLine[] {
  const manualSum = lines
    .filter((line) => !line.auto)
    .reduce((sum, line) => add(sum, parseRupeesOrZero(line.amountInput)), ZERO);
  const rest =
    compare(total, manualSum) > 0 ? subtract(total, manualSum) : ZERO;

  return lines.map((line) => ({
    method: line.method,
    amount: line.auto ? rest : parseRupeesOrZero(line.amountInput),
    auto: line.auto,
  }));
}

/** Typing into a line makes it the cashier's number, even if it was "the rest". */
export function typeSplitAmount(
  lines: SplitLine[],
  method: PaymentMethod,
  value: string,
): SplitLine[] {
  return lines.map((line) =>
    line.method === method
      ? { ...line, amountInput: value, auto: false }
      : line,
  );
}

/**
 * Adds a method. The old "rest" freezes at the amount it showed, so the line
 * the cashier was looking at does not change under them, and the new line
 * becomes the rest.
 */
export function addSplitLine(
  lines: SplitLine[],
  method: PaymentMethod,
  total: string,
): SplitLine[] {
  if (lines.some((line) => line.method === method)) return lines;
  const resolved = resolveSplit(lines, total);
  const frozen = lines.map((line, index) =>
    line.auto
      ? { ...line, amountInput: resolved[index].amount, auto: false }
      : line,
  );
  return [...frozen, { method, amountInput: "", auto: true }];
}

/**
 * Drops a method, never below two lines. If the removed line was "the rest",
 * the last remaining line takes over as the rest, with its field cleared.
 */
export function removeSplitLine(
  lines: SplitLine[],
  method: PaymentMethod,
): SplitLine[] {
  if (lines.length <= 2) return lines;
  const removed = lines.find((line) => line.method === method);
  if (!removed) return lines;

  const remaining = lines.filter((line) => line.method !== method);
  return removed.auto ? lastLineAuto(remaining) : remaining;
}

/** The enabled methods that have no line yet, in the shop's order. */
export function methodsToAdd(
  lines: SplitLine[],
  enabled: readonly PaymentMethod[],
): PaymentMethod[] {
  return enabled.filter((method) => !lines.some((l) => l.method === method));
}

/**
 * Drops lines for methods the owner has switched off. Fewer than two lines
 * left is no longer a split, so the caller falls back to one method (`null`).
 *
 * Every other line stays exactly as it was. The cashier did not touch them,
 * so no line turns into "the rest": a typed amount stays what was typed, and
 * if the dropped line was the rest, the status shows the real shortfall
 * (spec §9.2, §9.5). Removing a line by hand is `removeSplitLine`.
 */
export function keepEnabledLines(
  lines: SplitLine[],
  enabled: readonly PaymentMethod[],
): SplitLine[] | null {
  const kept = lines.filter((line) => enabled.includes(line.method));
  return kept.length < 2 ? null : kept;
}

function lastLineAuto(lines: SplitLine[]): SplitLine[] {
  return lines.map((line, index) =>
    index === lines.length - 1
      ? { ...line, amountInput: "", auto: true }
      : line,
  );
}

/**
 * What stops the cashier saving, or "paid" when nothing does. The checks run
 * in this order so the most useful message wins: a wrong total first, then an
 * empty line, then the cash handed over.
 */
export function splitStatus(
  resolved: ResolvedSplitLine[],
  total: string,
  cashGivenInput: string,
): SplitStatus {
  const sum = resolved.reduce((acc, line) => add(acc, line.amount), ZERO);
  const order = compare(sum, total);
  if (order > 0) return { kind: "OVER", amount: subtract(sum, total) };
  if (order < 0) return { kind: "SHORT", amount: subtract(total, sum) };

  const filled = resolved.filter((line) => !isZero(line.amount));
  if (filled.length < resolved.length) {
    // One method carrying the whole bill is a one-method bill, not a split.
    if (filled.length === 1) {
      return { kind: "SINGLE_METHOD", method: filled[0].method };
    }
    const empty = resolved.find((line) => isZero(line.amount));
    if (empty) return { kind: "ZERO_LINE", method: empty.method };
  }

  const cash = resolved.find((line) => line.method === "CASH");
  if (cash && cashGivenInput.trim()) {
    const given = parseRupeesOrZero(cashGivenInput);
    if (compare(given, cash.amount) < 0) {
      return { kind: "CASH_GIVEN_SHORT", cashAmount: cash.amount };
    }
    return { kind: "PAID", change: subtract(given, cash.amount) };
  }

  return { kind: "PAID", change: null };
}

/** The line under the split rows. Only PAID lets the cashier save. */
export function splitStatusText(status: SplitStatus): {
  tone: "warning" | "success" | "destructive";
  text: string;
  detail: string | null;
} {
  switch (status.kind) {
    case "SHORT":
      return {
        tone: "warning",
        text: `Collect ${formatINR(status.amount)} more`,
        detail: null,
      };
    case "OVER":
      return {
        tone: "destructive",
        text: `${formatINR(status.amount)} too much`,
        detail: null,
      };
    case "ZERO_LINE":
      return {
        tone: "warning",
        text: `Enter an amount for ${PAYMENT_METHOD_LABELS[status.method]}`,
        detail: null,
      };
    case "SINGLE_METHOD": {
      const label = PAYMENT_METHOD_LABELS[status.method];
      return {
        tone: "warning",
        text: `${label} covers the whole bill. Tap ${label} instead.`,
        detail: null,
      };
    }
    case "CASH_GIVEN_SHORT":
      return {
        tone: "warning",
        text: `Cash given is less than ${formatINR(status.cashAmount)}`,
        detail: null,
      };
    case "PAID":
      return {
        tone: "success",
        text: "Fully paid",
        detail:
          status.change === null
            ? `${formatINR(ZERO)} left`
            : `Change ${formatINR(status.change)}`,
      };
  }
}

/** The lines as the server expects them: method and exact amount only. */
export function splitPayload(
  resolved: ResolvedSplitLine[],
): SplitPaymentInput[] {
  return resolved.map(({ method, amount }) => ({ method, amount }));
}
