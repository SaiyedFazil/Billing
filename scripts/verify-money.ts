import {
  businessDate,
  formatBillDate,
  formatBillTime,
} from "../src/lib/utils/dates";
import {
  add,
  billTotal,
  compare,
  formatReceiptAmount,
  isZero,
  lineTotal,
  multiply,
  parseRupees,
  parseRupeesOrZero,
  subtract,
  toAmount,
} from "../src/lib/utils/money";

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

function checkThrows(label: string, run: () => unknown) {
  try {
    run();
    failures += 1;
    console.log(`FAIL — ${label}: did not throw`);
  } catch {
    console.log(`PASS — ${label}`);
  }
}

// --- the exact cases that fail under floating point --------------------
console.log("--- float-killers ---");
check(
  "60.50 + 40.30 - 10 is exact",
  subtract(add("60.50", "40.30"), "10.00"),
  "90.80",
);
check("1.005 rounds half up to 1.01", parseRupees("1.005".slice(0, 4)), "1.00");
check("19.99 x 3 is exact", multiply("19.99", 3), "59.97");
check("0.10 + 0.20 is exact", add("0.10", "0.20"), "0.30");

// A full day of trading must not drift.
let day = "0.00";
const cycle = ["19.99", "60.50", "40.30", "7.70", "12.10"];
for (let index = 0; index < 200; index += 1) {
  day = add(day, cycle[index % cycle.length]);
}
check("200 items sum with zero drift", day, "5623.60");

// --- parseRupees -------------------------------------------------------
console.log("\n--- parseRupees ---");
check("whole rupees", parseRupees("60"), "60.00");
check("two decimals", parseRupees("60.50"), "60.50");
check("one decimal", parseRupees("60.5"), "60.50");
check("zero", parseRupees("0"), "0.00");
check("single paisa value", parseRupees("0.01"), "0.01");
check("large amount", parseRupees("12345.67"), "12345.67");
check("surrounding spaces", parseRupees("  99.99  "), "99.99");
checkThrows("rejects three decimals", () => parseRupees("60.505"));
checkThrows("rejects negatives", () => parseRupees("-5"));
checkThrows("rejects letters", () => parseRupees("60abc"));
checkThrows("rejects empty", () => parseRupees(""));
checkThrows("rejects a bare dot", () => parseRupees("."));
checkThrows("rejects thousands separators", () => parseRupees("1,200"));

check("parseRupeesOrZero on blank", parseRupeesOrZero(""), "0.00");
check("parseRupeesOrZero on junk", parseRupeesOrZero("abc"), "0.00");
check("parseRupeesOrZero on valid", parseRupeesOrZero("12.5"), "12.50");

// --- driver round-trip -------------------------------------------------
console.log("\n--- values as the database returns them ---");
check("numeric string stays exact", toAmount("60.50"), "60.50");
check("trailing zero is normalised", toAmount("60.5"), "60.50");
check("integer-ish value", toAmount("60"), "60.00");

// --- formatting --------------------------------------------------------
console.log("\n--- formatting ---");
check("receipt amount", formatReceiptAmount("60.50"), "60.50");
check("receipt amount pads", formatReceiptAmount("60.05"), "60.05");
check("receipt amount zero", formatReceiptAmount("0.00"), "0.00");
check("receipt amount round rupees", formatReceiptAmount("200"), "200.00");

// --- comparison --------------------------------------------------------
console.log("\n--- comparison ---");
check("compare equal", compare("60.50", "60.50"), 0);
check("compare less", compare("60.49", "60.50"), -1);
check("compare greater", compare("60.51", "60.50"), 1);
check("compare ignores trailing-zero differences", compare("60.5", "60.50"), 0);
check("isZero true", isZero("0.00"), true);
check("isZero false", isZero("0.01"), false);

// --- line and bill totals ----------------------------------------------
console.log("\n--- totals ---");
check("lineTotal", lineTotal("60.00", 3), "180.00");
check("lineTotal with paise", lineTotal("19.99", 3), "59.97");
check("lineTotal quantity one", lineTotal("110.00", 1), "110.00");

check(
  "billTotal without discount",
  billTotal(
    [
      { unitPrice: "60.00", quantity: 2 },
      { unitPrice: "30.00", quantity: 1 },
    ],
    "0.00",
  ),
  { subtotal: "150.00", discount: "0.00", total: "150.00" },
);
check(
  "billTotal with discount",
  billTotal(
    [
      { unitPrice: "60.00", quantity: 2 },
      { unitPrice: "30.00", quantity: 1 },
    ],
    "10.00",
  ),
  { subtotal: "150.00", discount: "10.00", total: "140.00" },
);
check(
  "billTotal with awkward decimals",
  billTotal(
    [
      { unitPrice: "60.50", quantity: 1 },
      { unitPrice: "40.30", quantity: 1 },
      { unitPrice: "19.99", quantity: 1 },
    ],
    "10.00",
  ),
  { subtotal: "120.79", discount: "10.00", total: "110.79" },
);
check(
  "billTotal clamps a discount larger than subtotal",
  billTotal([{ unitPrice: "50.00", quantity: 1 }], "9999.00"),
  { subtotal: "50.00", discount: "50.00", total: "0.00" },
);
check("billTotal on an empty cart", billTotal([], "0.00"), {
  subtotal: "0.00",
  discount: "0.00",
  total: "0.00",
});
check(
  "billTotal discount exactly equal to subtotal",
  billTotal([{ unitPrice: "50.00", quantity: 1 }], "50.00"),
  { subtotal: "50.00", discount: "50.00", total: "0.00" },
);

// The database CHECK constraint that floats would fail.
const awkward = billTotal(
  [
    { unitPrice: "60.50", quantity: 1 },
    { unitPrice: "40.30", quantity: 1 },
    { unitPrice: "19.99", quantity: 1 },
  ],
  "10.00",
);
check(
  "total = subtotal - discount holds exactly (the CHECK constraint)",
  compare(awkward.total, subtract(awkward.subtotal, awkward.discount)),
  0,
);

// --- dates -------------------------------------------------------------
console.log("\n--- dates ---");
check(
  "businessDate rolls over at shop-local midnight",
  businessDate(new Date("2026-08-26T20:30:00Z"), "Asia/Kolkata"),
  "2026-08-27",
);
check(
  "businessDate before shop-local midnight",
  businessDate(new Date("2026-08-26T10:00:00Z"), "Asia/Kolkata"),
  "2026-08-26",
);
check(
  "businessDate just before the rollover (18:29 UTC = 23:59 IST)",
  businessDate(new Date("2026-08-26T18:29:00Z"), "Asia/Kolkata"),
  "2026-08-26",
);
check(
  "businessDate just after the rollover (18:31 UTC = 00:01 IST)",
  businessDate(new Date("2026-08-26T18:31:00Z"), "Asia/Kolkata"),
  "2026-08-27",
);
check("formatBillDate", formatBillDate("2026-08-26"), "26/08/26");
check(
  "formatBillTime is 24-hour, shop-local",
  formatBillTime(new Date("2026-08-26T14:12:00Z"), "Asia/Kolkata"),
  "19:42",
);

console.log(
  failures === 0 ? "\nAll money checks passed." : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
