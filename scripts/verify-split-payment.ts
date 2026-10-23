import type { PaymentMethod } from "../src/constants/payment-methods";
import { PAYMENT_METHODS } from "../src/constants/payment-methods";
import { planPayments } from "../src/lib/utils/bill-payments";
import { createBillSchema } from "../src/lib/validation/bill-schema";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"} — ${label}` +
      (pass
        ? ""
        : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

type Plan = ReturnType<typeof planPayments>;

/** The bill-level fields and the lines of a successful plan, or the error. */
function summary(result: Plan) {
  if (!result.ok) {
    return { error: result.error.code, message: result.error.message };
  }
  const { paymentMethod, tendered, changeDue, lines } = result.data;
  return { bill: { paymentMethod, tendered, changeDue }, lines };
}

function failure(result: Plan) {
  return result.ok
    ? "ok"
    : { code: result.error.code, message: result.error.message };
}

const ALL = [...PAYMENT_METHODS];
const TOTAL = "500.00";

const line = (
  method: PaymentMethod,
  amount: string,
  tendered: string | null,
  changeDue: string | null,
  position: number,
) => ({ method, amount, tendered, changeDue, position });

const splitBill = (tendered: string | null) => ({
  paymentMethod: "SPLIT" as const,
  tendered,
  changeDue: null,
});

const split = (
  lines: Array<{ method: PaymentMethod; amount: string }>,
  tendered: string | null = null,
  total = TOTAL,
  enabled: readonly PaymentMethod[] = ALL,
) =>
  planPayments(
    { paymentMethod: "SPLIT", tendered, splitPayments: lines },
    total,
    enabled,
  );

const CASH_UPI: Array<{ method: PaymentMethod; amount: string }> = [
  { method: "CASH", amount: "400.00" },
  { method: "UPI", amount: "100.00" },
];

const SPLIT_ONLY = "Split payments were sent for a bill that isn't split.";
const AT_LEAST_TWO = "Choose at least two payment methods to split a bill.";

// ---- One-method bills: today's behaviour, unchanged -------------------------

check(
  "CASH with tender: change due, one line",
  summary(
    planPayments({ paymentMethod: "CASH", tendered: "600.00" }, TOTAL, ALL),
  ),
  {
    bill: { paymentMethod: "CASH", tendered: "600.00", changeDue: "100.00" },
    lines: [line("CASH", "500.00", "600.00", "100.00", 1)],
  },
);

check(
  "UPI: no tender on the bill or the line",
  summary(
    planPayments({ paymentMethod: "UPI", tendered: "600.00" }, TOTAL, ALL),
  ),
  {
    bill: { paymentMethod: "UPI", tendered: null, changeDue: null },
    lines: [line("UPI", "500.00", null, null, 1)],
  },
);

check(
  "CASH tendered under the total is refused",
  failure(
    planPayments({ paymentMethod: "CASH", tendered: "499.99" }, TOTAL, ALL),
  ),
  {
    code: "VALIDATION",
    message: "The amount tendered is less than the bill total.",
  },
);

{
  const result = planPayments(
    { paymentMethod: "CASH", tendered: "499.99" },
    TOTAL,
    ALL,
  );
  check(
    "CASH tendered under the total names the tendered field",
    !result.ok && result.error.fields,
    { tendered: "Must be at least ₹500.00" },
  );
}

check(
  "a switched-off method is a CONFLICT",
  failure(
    planPayments({ paymentMethod: "CARD", tendered: null }, TOTAL, [
      "CASH",
      "UPI",
    ]),
  ),
  {
    code: "CONFLICT",
    message:
      "Card is no longer accepted at this shop. Pick another payment method.",
  },
);

check(
  "a Rs.0 bill saves with one Rs.0.00 line",
  summary(planPayments({ paymentMethod: "CASH", tendered: null }, "0.00", ALL)),
  {
    bill: { paymentMethod: "CASH", tendered: null, changeDue: null },
    lines: [line("CASH", "0.00", null, null, 1)],
  },
);

check(
  "a one-method bill that carries splitPayments is refused",
  failure(
    planPayments(
      { paymentMethod: "CASH", tendered: null, splitPayments: CASH_UPI },
      TOTAL,
      ALL,
    ),
  ),
  { code: "VALIDATION", message: SPLIT_ONLY },
);

check(
  "the split check comes before the enabled check",
  failure(
    planPayments(
      { paymentMethod: "CARD", tendered: null, splitPayments: CASH_UPI },
      TOTAL,
      ["CASH"],
    ),
  ),
  { code: "VALIDATION", message: SPLIT_ONLY },
);

check(
  "an empty splitPayments counts as none",
  summary(
    planPayments(
      { paymentMethod: "UPI", tendered: null, splitPayments: [] },
      TOTAL,
      ALL,
    ),
  ),
  {
    bill: { paymentMethod: "UPI", tendered: null, changeDue: null },
    lines: [line("UPI", "500.00", null, null, 1)],
  },
);

// ---- Split bills ------------------------------------------------------------

check(
  "CASH 400 + UPI 100: a SPLIT bill with no tender",
  summary(split(CASH_UPI)),
  {
    bill: splitBill(null),
    lines: [
      line("CASH", "400.00", null, null, 1),
      line("UPI", "100.00", null, null, 2),
    ],
  },
);

check(
  "cash given lands on the CASH line, not the bill",
  summary(split(CASH_UPI, "500.00")),
  {
    bill: splitBill(null),
    lines: [
      line("CASH", "400.00", "500.00", "100.00", 1),
      line("UPI", "100.00", null, null, 2),
    ],
  },
);

check(
  "lines keep the order sent, with CASH second",
  summary(
    split([
      { method: "UPI", amount: "100.00" },
      { method: "CASH", amount: "400.00" },
    ]),
  ),
  {
    bill: splitBill(null),
    lines: [
      line("UPI", "100.00", null, null, 1),
      line("CASH", "400.00", null, null, 2),
    ],
  },
);

check(
  "the float trap: 60.50 + 40.30 + 10.00 = 110.80",
  summary(
    split(
      [
        { method: "CASH", amount: "60.50" },
        { method: "UPI", amount: "40.30" },
        { method: "CARD", amount: "10.00" },
      ],
      null,
      "110.80",
    ),
  ),
  {
    bill: splitBill(null),
    lines: [
      line("CASH", "60.50", null, null, 1),
      line("UPI", "40.30", null, null, 2),
      line("CARD", "10.00", null, null, 3),
    ],
  },
);

// ---- Split rejections -------------------------------------------------------

check(
  "one line is not a split",
  failure(split([{ method: "CASH", amount: "500.00" }])),
  { code: "VALIDATION", message: AT_LEAST_TWO },
);

check(
  "SPLIT with no lines is refused the same way",
  failure(planPayments({ paymentMethod: "SPLIT", tendered: null }, TOTAL, ALL)),
  { code: "VALIDATION", message: AT_LEAST_TWO },
);

check(
  "a method used twice",
  failure(
    split([
      { method: "CASH", amount: "250.00" },
      { method: "CASH", amount: "250.00" },
    ]),
  ),
  {
    code: "VALIDATION",
    message: "Each payment method can be used only once on a bill.",
  },
);

check(
  "a switched-off method inside a split is a CONFLICT",
  failure(
    split(
      [
        { method: "CASH", amount: "400.00" },
        { method: "OTHER", amount: "100.00" },
      ],
      null,
      TOTAL,
      ["CASH", "UPI", "CARD"],
    ),
  ),
  {
    code: "CONFLICT",
    message:
      "Other is no longer accepted at this shop. Pick another payment method.",
  },
);

check(
  "a zero line is refused",
  failure(
    split([
      { method: "CASH", amount: "500.00" },
      { method: "UPI", amount: "0.00" },
    ]),
  ),
  { code: "VALIDATION", message: "Every split payment must be more than ₹0." },
);

check(
  "lines short of the total (400 + 99.99)",
  failure(
    split([
      { method: "CASH", amount: "400.00" },
      { method: "UPI", amount: "99.99" },
    ]),
  ),
  {
    code: "VALIDATION",
    message: "The payments don't add up to the bill total.",
  },
);

check(
  "lines over the total (400 + 100.01)",
  failure(
    split([
      { method: "CASH", amount: "400.00" },
      { method: "UPI", amount: "100.01" },
    ]),
  ),
  {
    code: "VALIDATION",
    message: "The payments don't add up to the bill total.",
  },
);

check(
  "cash given with no cash line",
  failure(
    split(
      [
        { method: "UPI", amount: "400.00" },
        { method: "CARD", amount: "100.00" },
      ],
      "500.00",
    ),
  ),
  {
    code: "VALIDATION",
    message: "Cash given needs a cash payment in the split.",
  },
);

check("cash given below the cash part", failure(split(CASH_UPI, "399.99")), {
  code: "VALIDATION",
  message: "Cash given is less than the cash part of the bill.",
});

{
  const result = split(CASH_UPI, "399.99");
  check(
    "cash given below the cash part names the tendered field",
    !result.ok && result.error.fields,
    { tendered: "Must be at least ₹400.00" },
  );
}

// ---- createBillSchema -------------------------------------------------------

const base = {
  idempotencyKey: crypto.randomUUID(),
  lines: [{ itemId: crypto.randomUUID(), quantity: 1 }],
  discount: "0.00",
  paymentMethod: "CASH",
  tendered: null,
  expectedTotal: "500.00",
};

const parses = (payload: unknown) =>
  createBillSchema.safeParse(payload).success;

const splitPayload = (splitPayments: unknown) => ({
  ...base,
  paymentMethod: "SPLIT",
  splitPayments,
});

check("a one-method payload with no splitPayments parses", parses(base), true);

check("paymentMethod SPLIT parses", parses(splitPayload(CASH_UPI)), true);

check(
  "a line with method SPLIT is rejected",
  parses(
    splitPayload([
      { method: "SPLIT", amount: "400.00" },
      { method: "UPI", amount: "100.00" },
    ]),
  ),
  false,
);

check(
  "a line amount given as the number 400 is rejected",
  parses(
    splitPayload([
      { method: "CASH", amount: 400 },
      { method: "UPI", amount: "100.00" },
    ]),
  ),
  false,
);

check(
  "a line amount of 1.005 is rejected",
  parses(
    splitPayload([
      { method: "CASH", amount: "1.005" },
      { method: "UPI", amount: "498.995" },
    ]),
  ),
  false,
);

check(
  "five lines are rejected",
  parses(
    splitPayload([
      { method: "CASH", amount: "100.00" },
      { method: "UPI", amount: "100.00" },
      { method: "CARD", amount: "100.00" },
      { method: "OTHER", amount: "100.00" },
      { method: "CASH", amount: "100.00" },
    ]),
  ),
  false,
);

console.log(
  failures === 0
    ? "\nAll split payment checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
