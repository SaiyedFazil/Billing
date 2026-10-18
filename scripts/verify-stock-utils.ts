import { clampLinesToMenu } from "../src/components/pages/bill/utils/cart";
import {
  maxSellable,
  parseWholeQuantity,
  planAdjustment,
  sellability,
  type StockLevel,
  stockStatus,
} from "../src/lib/utils/stock";
import { adjustStockSchema } from "../src/lib/validation/stock-schema";
import type { CartLine } from "../src/types/bill.types";
import type { MenuCategory, MenuItem } from "../src/types/item.types";

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

const tracked = (
  stockQuantity: number,
  lowStockThreshold = 10,
): StockLevel => ({
  trackStock: true,
  stockQuantity,
  lowStockThreshold,
});
const untracked: StockLevel = {
  trackStock: false,
  stockQuantity: 0,
  lowStockThreshold: 10,
};

// --- stockStatus ------------------------------------------------------
check("untracked reads UNTRACKED", stockStatus(untracked), "UNTRACKED");
check("zero reads OUT", stockStatus(tracked(0)), "OUT");
check("below the level reads LOW", stockStatus(tracked(3)), "LOW");
check("exactly the level reads LOW", stockStatus(tracked(10)), "LOW");
check("above the level reads IN_STOCK", stockStatus(tracked(11)), "IN_STOCK");
check("level 0 is never LOW", stockStatus(tracked(1, 0)), "IN_STOCK");
check("level 0 still goes OUT", stockStatus(tracked(0, 0)), "OUT");

// --- sellability ------------------------------------------------------
check(
  "the owner's Sold out switch wins over a zero count",
  sellability({ ...tracked(0), isAvailable: false }),
  "SOLD_OUT",
);
check(
  "a tracked item at zero is OUT_OF_STOCK",
  sellability({ ...tracked(0), isAvailable: true }),
  "OUT_OF_STOCK",
);
check(
  "an untracked item ignores its stored count",
  sellability({ ...untracked, isAvailable: true }),
  "SELLABLE",
);
check(
  "a tracked item with stock is SELLABLE",
  sellability({ ...tracked(4), isAvailable: true }),
  "SELLABLE",
);

// --- maxSellable ------------------------------------------------------
check("untracked caps at the line maximum", maxSellable(untracked), 99);
check("tracked caps at the count", maxSellable(tracked(3)), 3);
check("a big count still caps at 99", maxSellable(tracked(500)), 99);

// --- parseWholeQuantity -----------------------------------------------
for (const bad of ["", "-5", "1.5", "1e3", "100000", "abc", " ", "+3"]) {
  check(
    `parseWholeQuantity rejects ${JSON.stringify(bad)}`,
    parseWholeQuantity(bad),
    null,
  );
}
check("parseWholeQuantity trims", parseWholeQuantity(" 7 "), 7);
check("parseWholeQuantity accepts 0", parseWholeQuantity("0"), 0);
check(
  "parseWholeQuantity accepts the maximum",
  parseWholeQuantity("99999"),
  99999,
);

// --- planAdjustment ---------------------------------------------------
check("add", planAdjustment(10, "ADD", 5), { ok: true, after: 15, delta: 5 });
check("add past the maximum", planAdjustment(99_990, "ADD", 10), {
  ok: false,
  message: "Stock can't go above 99,999",
});
check("remove more than is left", planAdjustment(10, "REMOVE", 11), {
  ok: false,
  message: "Only 10 in stock",
});
check("remove everything", planAdjustment(10, "REMOVE", 10), {
  ok: true,
  after: 0,
  delta: -10,
});
check("set to the same count", planAdjustment(10, "SET", 10), {
  ok: false,
  message: "That's already the count",
});
check("set to zero", planAdjustment(10, "SET", 0), {
  ok: true,
  after: 0,
  delta: -10,
});

// --- adjustStockSchema ------------------------------------------------
const base = {
  itemId: "5b0c6f62-2b1e-4c3a-9b51-2f8f0b9b6d11",
  note: null,
};
check(
  "schema rejects adding 0",
  adjustStockSchema.safeParse({
    ...base,
    mode: "ADD",
    quantity: 0,
    reason: "RESTOCK",
  }).success,
  false,
);
check(
  "schema rejects a reason that doesn't fit the mode",
  adjustStockSchema.safeParse({
    ...base,
    mode: "REMOVE",
    quantity: 2,
    reason: "RESTOCK",
  }).success,
  false,
);
check(
  "schema rejects a 201-character note",
  adjustStockSchema.safeParse({
    ...base,
    mode: "ADD",
    quantity: 2,
    reason: "RESTOCK",
    note: "x".repeat(201),
  }).success,
  false,
);
check(
  "schema rejects a fractional quantity",
  adjustStockSchema.safeParse({
    ...base,
    mode: "ADD",
    quantity: 1.5,
    reason: "RESTOCK",
  }).success,
  false,
);
check(
  "schema accepts setting the count to 0",
  adjustStockSchema.safeParse({
    ...base,
    mode: "SET",
    quantity: 0,
    reason: "CORRECTION",
  }).success,
  true,
);

// --- clampLinesToMenu -------------------------------------------------
function menuItem(
  id: string,
  name: string,
  level: StockLevel,
  isAvailable = true,
): MenuItem {
  return {
    id,
    categoryId: "c",
    name,
    price: "30.00",
    imageUrl: null,
    isAvailable,
    ...level,
  };
}
function line(itemId: string, name: string, quantity: number): CartLine {
  return { itemId, name, unitPrice: "30.00", quantity, maxQuantity: 99 };
}
const menu = (items: MenuItem[]): MenuCategory[] => [
  { id: "c", name: "Drinks", items },
];

check(
  "a line above the new count is clamped to it",
  clampLinesToMenu(
    [line("a", "Coke", 5)],
    menu([menuItem("a", "Coke", tracked(3))]),
  ),
  { lines: [{ ...line("a", "Coke", 3), maxQuantity: 3 }], changed: ["Coke"] },
);
check(
  "a line whose item ran out is removed",
  clampLinesToMenu(
    [line("a", "Coke", 2)],
    menu([menuItem("a", "Coke", tracked(0))]),
  ),
  { lines: [], changed: ["Coke"] },
);
check(
  "a line whose item was marked Sold out is removed",
  clampLinesToMenu(
    [line("a", "Coke", 2)],
    menu([menuItem("a", "Coke", tracked(9), false)]),
  ),
  { lines: [], changed: ["Coke"] },
);
check(
  "a line whose item left the menu is removed",
  clampLinesToMenu([line("a", "Coke", 2)], menu([])),
  { lines: [], changed: ["Coke"] },
);
check(
  "an untracked line is left alone",
  clampLinesToMenu(
    [line("b", "Fries", 4)],
    menu([menuItem("b", "Fries", untracked)]),
  ),
  { lines: [line("b", "Fries", 4)], changed: [] },
);

console.log(
  failures === 0
    ? "\nAll stock helper checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
