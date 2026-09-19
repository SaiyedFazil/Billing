import Big from "big.js";

/**
 * Money in this application is RUPEES, held as a decimal string like "60.50".
 *
 * Never a JavaScript number. `60.50 + 40.30 - 10` evaluates to
 * 110.78999999999999 in binary floating point, which fails the database's
 * `total = subtotal - discount` CHECK constraint and quietly loses paise on
 * every rounded discount. big.js does exact decimal arithmetic, and Postgres
 * stores these columns as `numeric(10,2)`, so the two agree exactly.
 *
 * This file is the only place money arithmetic happens.
 */

// Round half away from zero — what a till does, and what a customer expects.
Big.RM = Big.roundHalfUp;
// Guards against a runaway value being formatted in exponential notation.
Big.NE = -9;
Big.PE = 21;

/** Rupees with at most two decimals, no sign, no thousands separators. */
const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

export const ZERO = "0.00";

/**
 * Validates a user-typed rupee amount and normalises it to two decimals.
 *
 * @throws if the input is not a plain non-negative rupee amount.
 */
export function parseRupees(input: string): string {
  const trimmed = input.trim();
  if (!RUPEE_PATTERN.test(trimmed)) {
    throw new Error(`Invalid rupee amount: "${input}"`);
  }
  return new Big(trimmed).toFixed(2);
}

/** Blank means zero. Anything unparseable also means zero — for live UI totals. */
export function parseRupeesOrZero(input: string): string {
  if (!input.trim()) return ZERO;
  try {
    return parseRupees(input);
  } catch {
    return ZERO;
  }
}

/** Normalises whatever the database driver returned into "60.50". */
export function toAmount(value: string | number): string {
  return new Big(value).toFixed(2);
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * For the screen: "₹1,10,79.00" with Indian digit grouping.
 *
 * The Number() conversion here is safe because the result is a string that
 * never re-enters arithmetic, and two-decimal rupee values are exactly
 * representable well beyond any realistic bill.
 */
export function formatINR(rupees: string): string {
  return INR.format(Number(rupees));
}

/** For the receipt's aligned columns: plain digits, no symbol, no grouping. */
export function formatReceiptAmount(rupees: string): string {
  return new Big(rupees).toFixed(2);
}

export function add(a: string, b: string): string {
  return new Big(a).plus(b).toFixed(2);
}

export function subtract(a: string, b: string): string {
  return new Big(a).minus(b).toFixed(2);
}

export function multiply(amount: string, factor: number): string {
  return new Big(amount).times(factor).toFixed(2);
}

/**
 * The one money operation that cannot be exact — use it only for genuine
 * averages (e.g. average bill value), never to split a real amount between
 * parties, where the remainder would silently vanish.
 *
 * @throws if the divisor is zero. Callers guard on count === 0 first.
 */
export function divide(amount: string, divisor: number): string {
  if (divisor === 0) {
    throw new Error("Cannot divide an amount by zero");
  }
  return new Big(amount).div(divisor).toFixed(2);
}

/** -1 if a < b, 0 if equal, 1 if a > b. */
export function compare(a: string, b: string): number {
  return new Big(a).cmp(new Big(b));
}

export function isNegative(amount: string): boolean {
  return new Big(amount).lt(0);
}

export function isZero(amount: string): boolean {
  return new Big(amount).eq(0);
}

export function lineTotal(unitPrice: string, quantity: number): string {
  return multiply(unitPrice, quantity);
}

export type PricedLine = { unitPrice: string; quantity: number };

/**
 * Computes bill totals.
 *
 * The discount is CLAMPED to [0, subtotal]. Callers that need to know the raw
 * value was out of range compare the returned `discount` against what they
 * passed in — that is how create-bill-service rejects a bad discount rather
 * than silently charging a different amount.
 */
export function billTotal(
  lines: PricedLine[],
  discount: string,
): { subtotal: string; discount: string; total: string } {
  const subtotal = lines.reduce(
    (sum, line) => new Big(sum).plus(lineTotal(line.unitPrice, line.quantity)),
    new Big(0),
  );

  let clamped = new Big(discount);
  if (clamped.lt(0)) clamped = new Big(0);
  if (clamped.gt(subtotal)) clamped = subtotal;

  return {
    subtotal: subtotal.toFixed(2),
    discount: clamped.toFixed(2),
    total: subtotal.minus(clamped).toFixed(2),
  };
}
