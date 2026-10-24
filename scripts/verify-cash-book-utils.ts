import {
  billMethodGroup,
  buildCashBookDays,
  expenseModeGroup,
  isFutureDate,
  summarizeCashBook,
} from "../src/lib/utils/cash-book";
import { expensesCsv } from "../src/lib/utils/expense-export";
import { parseExpenseListParams } from "../src/lib/utils/expense-list-params";
import {
  defaultMonth,
  expenseListHref,
  formatSheetDate,
  groupMonthsByYear,
  monthBounds,
  monthLabel,
  monthOfRange,
  parsePageSize,
} from "../src/lib/utils/expense-spreadsheet";
import {
  cancelExpenseSchema,
  createExpenseSchema,
} from "../src/lib/validation/expense-schema";

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

// --- grouping -----------------------------------------------------------
check("cash expense is offline", expenseModeGroup("CASH"), "CASH");
check(
  "UPI, card and bank transfer expenses are online",
  [
    expenseModeGroup("UPI"),
    expenseModeGroup("CARD"),
    expenseModeGroup("BANK_TRANSFER"),
  ],
  ["ONLINE", "ONLINE", "ONLINE"],
);
check(
  "bill methods map to cash, online, online, other",
  [
    billMethodGroup("CASH"),
    billMethodGroup("UPI"),
    billMethodGroup("CARD"),
    billMethodGroup("OTHER"),
  ],
  ["CASH", "ONLINE", "ONLINE", "OTHER"],
);

// --- day merge ----------------------------------------------------------
const days = buildCashBookDays(
  [
    { date: "2026-10-19", paymentMethod: "CASH", total: "60.50" },
    { date: "2026-10-19", paymentMethod: "UPI", total: "40.30" },
    { date: "2026-10-20", paymentMethod: "OTHER", total: "100.00" },
    { date: "2026-10-20", paymentMethod: "CARD", total: "0.10" },
  ],
  [
    { date: "2026-10-19", mode: "CASH", total: "10.00" },
    { date: "2026-10-18", mode: "BANK_TRANSFER", total: "250.00" },
  ],
);
check("one row per active date, newest first", days, [
  {
    date: "2026-10-20",
    inCash: "0.00",
    inOnline: "0.10",
    inOther: "100.00",
    outCash: "0.00",
    outOnline: "0.00",
    net: "100.10",
  },
  {
    // The CLAUDE.md money example, summed through money.ts.
    date: "2026-10-19",
    inCash: "60.50",
    inOnline: "40.30",
    inOther: "0.00",
    outCash: "10.00",
    outOnline: "0.00",
    net: "90.80",
  },
  {
    date: "2026-10-18",
    inCash: "0.00",
    inOnline: "0.00",
    inOther: "0.00",
    outCash: "0.00",
    outOnline: "250.00",
    net: "-250.00",
  },
]);

check("summary of the fixture", summarizeCashBook(days), {
  moneyIn: { cash: "60.50", online: "40.40", other: "100.00", total: "200.90" },
  moneyOut: { cash: "10.00", online: "250.00", other: "0.00", total: "260.00" },
  net: { cash: "50.50", online: "-209.60", other: "100.00", total: "-59.10" },
});

const zero = { cash: "0.00", online: "0.00", other: "0.00", total: "0.00" };
check("no bills and no expenses → no days", buildCashBookDays([], []), []);
check("an empty summary is all zero", summarizeCashBook([]), {
  moneyIn: zero,
  moneyOut: zero,
  net: zero,
});

// --- dates --------------------------------------------------------------
check(
  "tomorrow is in the future",
  isFutureDate("2026-10-21", "2026-10-20"),
  true,
);
check("today is not", isFutureDate("2026-10-20", "2026-10-20"), false);
check("yesterday is not", isFutureDate("2026-10-19", "2026-10-20"), false);

// --- validation ---------------------------------------------------------
const validExpense = {
  idempotencyKey: "6f1c2b8e-3d4a-4f5b-8c6d-7e8f9a0b1c2d",
  expenseDate: "2026-10-20",
  amount: "250.00",
  mode: "CASH",
  categoryId: "0b6e3c1a-2d4f-4a5b-9c8d-1e2f3a4b5c6d",
  paidTo: "Ravi Vegetables",
  note: "Onion, tomato",
};
const parse = (overrides: Record<string, unknown>) =>
  createExpenseSchema.safeParse({ ...validExpense, ...overrides });

for (const amount of [
  "",
  "0",
  "0.00",
  "-5",
  "1.005",
  "1e3",
  "1,250",
  "1000000.01",
]) {
  check(
    `amount ${JSON.stringify(amount)} is rejected`,
    parse({ amount }).success,
    false,
  );
}
check(
  'amount " 250 " saves as 250.00',
  parse({ amount: " 250 " }).data?.amount,
  "250.00",
);
check(
  "₹10,00,000 exactly is accepted",
  parse({ amount: "1000000" }).data?.amount,
  "1000000.00",
);
check(
  "a zero amount explains itself",
  parse({ amount: "0" }).error?.issues[0]?.message,
  "Enter an amount above ₹0",
);
check(
  "an absurd amount explains itself",
  parse({ amount: "1000000.01" }).error?.issues[0]?.message,
  "That's more than ₹10,00,000. Check the amount.",
);
check(
  "blank paid to is stored as null",
  parse({ paidTo: "   " }).data?.paidTo,
  null,
);
check(
  "paid to over 80 characters is rejected",
  parse({ paidTo: "x".repeat(81) }).success,
  false,
);
check(
  "a note over 200 characters is rejected",
  parse({ note: "x".repeat(201) }).success,
  false,
);
check("OTHER is not an expense mode", parse({ mode: "OTHER" }).success, false);
check(
  "a blank cancel reason is rejected",
  cancelExpenseSchema.safeParse({ id: validExpense.categoryId, reason: "  " })
    .success,
  false,
);

// --- CSV ----------------------------------------------------------------
const csvLines = expensesCsv([
  {
    id: "a",
    expenseDate: "2026-10-20",
    amount: "1250.00",
    mode: "UPI",
    categoryId: "c1",
    categoryName: "Vegetables & dairy",
    categoryIsActive: true,
    paidTo: "Ravi",
    note: 'Onion, "fresh"',
    createdByName: "Shop Owner",
    createdAt: "2026-10-20T05:00:00.000Z",
    edited: false,
    cancelledAt: null,
    cancelReason: null,
  },
  {
    id: "b",
    expenseDate: "2026-10-19",
    amount: "450.00",
    mode: "CASH",
    categoryId: "c2",
    categoryName: "Repairs & maintenance",
    categoryIsActive: false,
    paidTo: null,
    note: null,
    createdByName: "Shop Owner",
    createdAt: "2026-10-19T05:00:00.000Z",
    edited: true,
    cancelledAt: "2026-10-19T06:00:00.000Z",
    cancelReason: "Entered twice",
  },
]).split("\r\n");
check(
  "the CSV header",
  csvLines[0],
  "﻿Date,Category,Paid to,Note,Mode,Group,Amount,Status,Cancel reason,Entered by,Entered at",
);
check(
  "a note with a comma and quotes is escaped; online mode and group",
  csvLines[1],
  '2026-10-20,Vegetables & dairy,Ravi,"Onion, ""fresh""",UPI,Online,1250.00,Active,,Shop Owner,2026-10-20T05:00:00.000Z',
);
check(
  "a cancelled row reads Cancelled with its reason",
  csvLines[2],
  "2026-10-19,Repairs & maintenance,,,Cash,Cash,450.00,Cancelled,Entered twice,Shop Owner,2026-10-19T05:00:00.000Z",
);

// --- spreadsheet view ---------------------------------------------------
check(
  "rows per page accepts only 25, 50 and 100",
  ["25", "50", "100", "", "10", "1000", "abc", "50.0"].map(parsePageSize),
  [25, 50, 100, 25, 25, 25, 25, 25],
);
check("a month's bounds", monthBounds("2026-10"), {
  from: "2026-10-01",
  to: "2026-10-31",
});
check(
  "February in a leap year ends on the 29th",
  monthBounds("2028-02")?.to,
  "2028-02-29",
);
check(
  "February in a common year ends on the 28th",
  monthBounds("2026-02")?.to,
  "2026-02-28",
);
check(
  "a malformed month has no bounds",
  ["2026-13", "2026-00", "2026-1", "", "abcd-ef"].map(monthBounds),
  [null, null, null, null, null],
);
check(
  "a range that is exactly one month names it",
  monthOfRange("2026-10-01", "2026-10-31"),
  "2026-10",
);
check(
  "a range that is not exactly one month names none",
  [
    monthOfRange("2026-10-01", "2026-10-24"),
    monthOfRange("2026-10-02", "2026-10-31"),
    monthOfRange("2026-09-01", "2026-10-31"),
  ],
  [null, null, null],
);
check("a month reads in words", monthLabel("2026-10"), "October 2026");
check(
  "months group under their year, newest first",
  groupMonthsByYear([
    { month: "2026-10", count: 2 },
    { month: "2026-07", count: 9 },
    { month: "2025-12", count: 21 },
  ]),
  [
    {
      year: "2026",
      months: [
        { month: "2026-10", count: 2 },
        { month: "2026-07", count: 9 },
      ],
    },
    { year: "2025", months: [{ month: "2025-12", count: 21 }] },
  ],
);
check("no months, no groups", groupMonthsByYear([]), []);
const sheetMonths = [
  { month: "2026-10", count: 2 },
  { month: "2026-07", count: 9 },
];
check(
  "month view opens on the range's month when it has expenses",
  defaultMonth("2026-07-05", sheetMonths),
  "2026-07",
);
check(
  "otherwise on the newest month with expenses",
  defaultMonth("2026-08-01", sheetMonths),
  "2026-10",
);
check(
  "with no expenses at all there is no month",
  defaultMonth("2026-08-01", []),
  null,
);
check(
  "the grid's date is day-month-year",
  formatSheetDate("2026-10-20"),
  "20-10-2026",
);
check(
  "a link keeps the range and only the filters that are set",
  [
    expenseListHref("/x", {
      from: "2026-10-01",
      to: "2026-10-24",
      group: "cash",
      categoryId: "",
    }),
    expenseListHref("/x", {
      from: "2026-10-01",
      to: "2026-10-31",
      group: "",
      categoryId: "",
    }),
  ],
  [
    "/x?from=2026-10-01&to=2026-10-24&group=cash",
    "/x?from=2026-10-01&to=2026-10-31",
  ],
);

const listParams = (values: Record<string, string>) =>
  parseExpenseListParams((key) => values[key] ?? "");
check(
  "list params: cash, a category and page 3",
  listParams({
    group: "cash",
    categoryId: "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b",
    page: "3",
  }),
  {
    group: "CASH",
    groupParam: "cash",
    categoryId: "6f1c2b9e-3a4d-4e5f-8a7b-1c2d3e4f5a6b",
    page: 3,
  },
);
check(
  "list params: junk falls back to the defaults",
  listParams({ group: "bogus", categoryId: "not-a-uuid", page: "-2" }),
  { groupParam: "bogus", page: 1 },
);

console.log(
  failures === 0
    ? "\nAll cash book helper checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
