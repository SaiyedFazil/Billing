import {
  type BillPaymentMethod,
  collectsTender,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
  SPLIT,
} from "@/constants/payment-methods";
import {
  add,
  compare,
  formatINR,
  subtract,
  toAmount,
  ZERO,
} from "@/lib/utils/money";
import { type ActionResult, fail, ok } from "@/lib/utils/result";

/** One line of a split, as the browser sends it. */
export type SplitPaymentInput = { method: PaymentMethod; amount: string };

/** A `bill_payments` row, ready to insert once the bill has an id. */
export type PlannedPaymentLine = {
  method: PaymentMethod;
  amount: string;
  tendered: string | null;
  changeDue: string | null;
  position: number;
};

/** How a bill was paid: the bill-level fields and its lines. */
export type PaymentPlan = {
  paymentMethod: BillPaymentMethod;
  tendered: string | null;
  changeDue: string | null;
  lines: PlannedPaymentLine[];
};

/** A line per method, and a method can appear only once. */
export const MAX_SPLIT_LINES = PAYMENT_METHODS.length;

type PaymentInput = {
  paymentMethod: BillPaymentMethod;
  tendered: string | null;
  splitPayments?: SplitPaymentInput[] | null;
};

function notAccepted(method: PaymentMethod) {
  return fail<PaymentPlan>(
    "CONFLICT",
    `${PAYMENT_METHOD_LABELS[method]} is no longer accepted at this shop. Pick another payment method.`,
  );
}

/**
 * Turns what the browser sent into the bill's payment lines, or says why not.
 *
 * Pure, and run before the transaction opens (spec §8): a server action is a
 * publicly callable endpoint, so the enabled methods and the sums are checked
 * here, never trusted from the till.
 *
 * A one-method bill is checked exactly as it was before split payment: the
 * enabled method, then the cash tender. A split is checked in the order the
 * cashier would meet the problems: count, duplicates, enabled, > 0, sum, then
 * the cash given.
 */
export function planPayments(
  input: PaymentInput,
  total: string,
  enabled: readonly PaymentMethod[],
): ActionResult<PaymentPlan> {
  const splitPayments = input.splitPayments ?? [];

  if (input.paymentMethod !== SPLIT) {
    const method = input.paymentMethod;

    // The browser sends no lines for a one-method bill; an empty array is none.
    if (splitPayments.length > 0) {
      return fail(
        "VALIDATION",
        "Split payments were sent for a bill that isn't split.",
      );
    }
    if (!enabled.includes(method)) return notAccepted(method);

    let tendered: string | null = null;
    let changeDue: string | null = null;

    if (collectsTender(method) && input.tendered !== null) {
      tendered = toAmount(input.tendered);
      if (compare(tendered, total) < 0) {
        return fail(
          "VALIDATION",
          "The amount tendered is less than the bill total.",
          { tendered: `Must be at least ${formatINR(total)}` },
        );
      }
      changeDue = subtract(tendered, total);
    }

    return ok({
      paymentMethod: method,
      tendered,
      changeDue,
      lines: [{ method, amount: total, tendered, changeDue, position: 1 }],
    });
  }

  if (splitPayments.length < 2) {
    return fail(
      "VALIDATION",
      "Choose at least two payment methods to split a bill.",
    );
  }

  const methods = splitPayments.map((payment) => payment.method);
  if (new Set(methods).size !== methods.length) {
    return fail(
      "VALIDATION",
      "Each payment method can be used only once on a bill.",
    );
  }

  for (const method of methods) {
    if (!enabled.includes(method)) return notAccepted(method);
  }

  const amounts = splitPayments.map((payment) => toAmount(payment.amount));
  if (amounts.some((amount) => compare(amount, ZERO) <= 0)) {
    return fail("VALIDATION", "Every split payment must be more than ₹0.");
  }

  const paid = amounts.reduce((sum, amount) => add(sum, amount), ZERO);
  if (compare(paid, total) !== 0) {
    return fail("VALIDATION", "The payments don't add up to the bill total.");
  }

  const cashIndex = methods.findIndex((method) => collectsTender(method));
  if (input.tendered !== null && cashIndex === -1) {
    return fail("VALIDATION", "Cash given needs a cash payment in the split.");
  }

  const lines: PlannedPaymentLine[] = splitPayments.map((payment, index) => ({
    method: payment.method,
    amount: amounts[index],
    tendered: null,
    changeDue: null,
    position: index + 1,
  }));

  // Cash given belongs to the cash line; the bill itself carries no tender.
  if (input.tendered !== null) {
    const tendered = toAmount(input.tendered);
    const cashAmount = amounts[cashIndex];
    if (compare(tendered, cashAmount) < 0) {
      return fail(
        "VALIDATION",
        "Cash given is less than the cash part of the bill.",
        { tendered: `Must be at least ${formatINR(cashAmount)}` },
      );
    }
    lines[cashIndex].tendered = tendered;
    lines[cashIndex].changeDue = subtract(tendered, cashAmount);
  }

  return ok({ paymentMethod: SPLIT, tendered: null, changeDue: null, lines });
}
