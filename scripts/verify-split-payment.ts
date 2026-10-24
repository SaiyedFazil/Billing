import type { PaymentMethod } from "../src/constants/payment-methods";
import { PAYMENT_METHODS } from "../src/constants/payment-methods";
import {
  addSplitLine,
  canSplit,
  keepEnabledLines,
  methodsToAdd,
  removeSplitLine,
  resolveSplit,
  type SplitLine,
  splitPayload as toSplitPayload,
  splitStatus,
  splitStatusText,
  startSplit,
  startsNewOrder,
  typeSplitAmount,
} from "../src/components/pages/bill/utils/split-payment";
import { planPayments } from "../src/lib/utils/bill-payments";
import { formatINR } from "../src/lib/utils/money";
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

// ---- The till's split maths -------------------------------------------------

check(
  "formatINR writes the rupee sign with two decimals",
  formatINR("100.00"),
  "₹100.00",
);

const sl = (
  method: PaymentMethod,
  amountInput: string,
  auto: boolean,
): SplitLine => ({ method, amountInput, auto });

/** Resolve, then read the status the cashier would see. */
function tillView(lines: SplitLine[], total: string, cashGiven = "") {
  const resolved = resolveSplit(lines, total);
  const status = splitStatus(resolved, total, cashGiven);
  return { resolved, status, text: splitStatusText(status) };
}

const amounts = (lines: ReturnType<typeof resolveSplit>) =>
  lines.map((l) => `${l.method} ${l.amount}`);

check("canSplit: one method is not enough", canSplit(["CASH"], TOTAL), false);
check(
  "canSplit: a Rs.0 bill cannot split",
  canSplit(["CASH", "UPI"], "0.00"),
  false,
);
check(
  "canSplit: two methods and a total",
  canSplit(["CASH", "UPI"], TOTAL),
  true,
);

// The first item on an empty cart is a new customer: the till drops the
// payment an abandoned order left behind before adding it.
const cartLine = (unitPrice: string) => ({
  itemId: crypto.randomUUID(),
  name: "Probe Burger",
  unitPrice,
  quantity: 1,
  maxQuantity: 10,
});

check(
  "startsNewOrder: an empty cart starts a new order",
  startsNewOrder([]),
  true,
);
check(
  "startsNewOrder: a second item is the same order",
  startsNewOrder([cartLine("60.00")]),
  false,
);
check(
  "startsNewOrder: a Rs.0 total with items on the bill is the same order",
  startsNewOrder([cartLine("0.00")]),
  false,
);

check("startSplit: Cash first, then the next method", startSplit(ALL), [
  sl("CASH", "", false),
  sl("UPI", "", true),
]);
check("startSplit: Cash disabled", startSplit(["UPI", "CARD"]), [
  sl("UPI", "", false),
  sl("CARD", "", true),
]);
check(
  "startSplit: Cash is first even when listed later",
  startSplit(["CARD", "CASH"]),
  [sl("CASH", "", false), sl("CARD", "", true)],
);

const typedCash = typeSplitAmount(startSplit(ALL), "CASH", "400");

{
  const view = tillView(typedCash, TOTAL);
  check("typing CASH 400 leaves UPI as the rest", amounts(view.resolved), [
    "CASH 400.00",
    "UPI 100.00",
  ]);
  check("the UPI line stays auto", view.resolved[1].auto, true);
  check("CASH 400 + UPI 100 is PAID with no change", view.status, {
    kind: "PAID",
    change: null,
  });
  check("PAID text", view.text, {
    tone: "success",
    text: "Fully paid",
    detail: "₹0.00 left",
  });
}

check(
  "the auto line follows a discount",
  amounts(resolveSplit(typedCash, "450.00")),
  ["CASH 400.00", "UPI 50.00"],
);

{
  const typedBoth = typeSplitAmount(typedCash, "UPI", "100");
  const view = tillView(typedBoth, "450.00");
  check("typed UPI does not follow a discount", view.status, {
    kind: "OVER",
    amount: "50.00",
  });
  check("OVER text", view.text, {
    tone: "destructive",
    text: "₹50.00 too much",
    detail: null,
  });
}

{
  const view = tillView(typeSplitAmount(typedCash, "UPI", "50"), TOTAL);
  check("CASH 400 + UPI 50 is SHORT", view.status, {
    kind: "SHORT",
    amount: "50.00",
  });
  check("SHORT text", view.text, {
    tone: "warning",
    text: "Collect ₹50.00 more",
    detail: null,
  });
}

{
  const view = tillView(typeSplitAmount(startSplit(ALL), "CASH", "500"), TOTAL);
  check("CASH 500 leaves UPI at 0.00", amounts(view.resolved), [
    "CASH 500.00",
    "UPI 0.00",
  ]);
  check("one method covering the bill is SINGLE_METHOD", view.status, {
    kind: "SINGLE_METHOD",
    method: "CASH",
  });
  check("SINGLE_METHOD text", view.text, {
    tone: "warning",
    text: "Cash covers the whole bill. Tap Cash instead.",
    detail: null,
  });
}

// Three lines: CASH 300, UPI freezes at 200, CARD is the rest.
const threeLines = addSplitLine(
  typeSplitAmount(startSplit(ALL), "CASH", "300"),
  "CARD",
  TOTAL,
);

check("addSplitLine freezes the old rest and appends a new one", threeLines, [
  sl("CASH", "300", false),
  sl("UPI", "200.00", false),
  sl("CARD", "", true),
]);

{
  const view = tillView(threeLines, TOTAL);
  check("a rest of 0.00 is a ZERO_LINE", view.status, {
    kind: "ZERO_LINE",
    method: "CARD",
  });
  check("ZERO_LINE text", view.text, {
    tone: "warning",
    text: "Enter an amount for Card",
    detail: null,
  });
}

{
  const retyped = typeSplitAmount(threeLines, "UPI", "150");
  const view = tillView(retyped, TOTAL);
  check("typing UPI 150 hands CARD the remaining 50", amounts(view.resolved), [
    "CASH 300.00",
    "UPI 150.00",
    "CARD 50.00",
  ]);
  check("three lines, all non-zero, is PAID", view.status, {
    kind: "PAID",
    change: null,
  });
}

check(
  "removeSplitLine does nothing at two lines",
  removeSplitLine(typedCash, "UPI"),
  typedCash,
);
check(
  "removing the auto line makes the last remaining line auto",
  removeSplitLine(threeLines, "CARD"),
  [sl("CASH", "300", false), sl("UPI", "", true)],
);
check(
  "removing a manual line keeps the auto line",
  removeSplitLine(threeLines, "UPI"),
  [sl("CASH", "300", false), sl("CARD", "", true)],
);

{
  const view = tillView(typedCash, TOTAL, "500");
  check("cash given above the cash part gives change", view.status, {
    kind: "PAID",
    change: "100.00",
  });
  check("PAID with change text", view.text, {
    tone: "success",
    text: "Fully paid",
    detail: "Change ₹100.00",
  });
}

{
  const view = tillView(typedCash, TOTAL, "399");
  check("cash given below the cash part", view.status, {
    kind: "CASH_GIVEN_SHORT",
    cashAmount: "400.00",
  });
  check("CASH_GIVEN_SHORT text", view.text, {
    tone: "warning",
    text: "Cash given is less than ₹400.00",
    detail: null,
  });
}

check(
  "cash given equal to the cash part gives zero change",
  tillView(typedCash, TOTAL, "400.00").status,
  { kind: "PAID", change: "0.00" },
);

check(
  "cash given with no cash line is ignored",
  tillView(
    typeSplitAmount(startSplit(["UPI", "CARD"]), "UPI", "400"),
    TOTAL,
    "999",
  ).status,
  { kind: "PAID", change: null },
);

for (const junk of ["", ".", "abc", "1.005"]) {
  const lines = typeSplitAmount(startSplit(ALL), "CASH", junk);
  const view = tillView(lines, TOTAL);
  check(
    `CASH ${JSON.stringify(junk)} reads as Rs.0 and UPI covers it all`,
    [amounts(view.resolved), view.status],
    [["CASH 0.00", "UPI 500.00"], { kind: "SINGLE_METHOD", method: "UPI" }],
  );
}

{
  // 60.50 + 40.30 + 10.00 = 110.80, which a float cannot add up.
  const total = "110.80";
  const lines = typeSplitAmount(
    addSplitLine(
      typeSplitAmount(startSplit(ALL), "CASH", "60.50"),
      "CARD",
      total,
    ),
    "UPI",
    "40.30",
  );
  const view = tillView(lines, total);
  check("the float trap leaves CARD exactly 10.00", amounts(view.resolved), [
    "CASH 60.50",
    "UPI 40.30",
    "CARD 10.00",
  ]);
  check("the float trap is PAID", view.status, { kind: "PAID", change: null });
}

{
  // UPI typed before CARD is added: there is no auto line to freeze.
  const total = "110.80";
  const lines = addSplitLine(
    typeSplitAmount(
      typeSplitAmount(startSplit(ALL), "CASH", "60.50"),
      "UPI",
      "40.30",
    ),
    "CARD",
    total,
  );
  check(
    "adding a line when none is auto",
    amounts(resolveSplit(lines, total)),
    ["CASH 60.50", "UPI 40.30", "CARD 10.00"],
  );
}

check(
  "keepEnabledLines: one line left is null",
  keepEnabledLines(typedCash, ["CASH"]),
  null,
);
check(
  "keepEnabledLines: all enabled changes nothing",
  keepEnabledLines(threeLines, ALL),
  threeLines,
);
check(
  "keepEnabledLines: dropping the auto line makes the last line auto",
  keepEnabledLines(threeLines, ["CASH", "UPI", "OTHER"]),
  [sl("CASH", "300", false), sl("UPI", "", true)],
);
check(
  "keepEnabledLines: dropping a manual line keeps the auto line",
  keepEnabledLines(threeLines, ["CASH", "CARD"]),
  [sl("CASH", "300", false), sl("CARD", "", true)],
);

check(
  "methodsToAdd lists the methods not yet used, in order",
  methodsToAdd(typedCash, ALL),
  ["CARD", "OTHER"],
);
check(
  "methodsToAdd skips a disabled method",
  methodsToAdd(typedCash, ["CASH", "UPI", "OTHER"]),
  ["OTHER"],
);

check(
  "splitPayload carries method and amount only",
  toSplitPayload(resolveSplit(typedCash, TOTAL)),
  [
    { method: "CASH", amount: "400.00" },
    { method: "UPI", amount: "100.00" },
  ],
);

console.log(
  failures === 0
    ? "\nAll split payment checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
