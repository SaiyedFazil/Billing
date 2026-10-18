import { describeMovement } from "../src/components/pages/administration/items/update-stock-dialog/utils/describe-movement";
import { cartReducer } from "../src/components/pages/bill/hooks/useCartReducer";
import {
  atStockCap,
  clampLinesToMenu,
  topSearchMatch,
} from "../src/components/pages/bill/utils/cart";
import {
  countByStatus,
  matchesStockFilter,
  maxSellable,
  parseStockFilter,
  parseWholeQuantity,
  planAdjustment,
  sellability,
  startsTracking,
  STOCK_FILTER_PARAM,
  type StockLevel,
  stockStatus,
} from "../src/lib/utils/stock";
import type { StockMovementRow } from "../src/types/stock.types";
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

// --- startsTracking ---------------------------------------------------
check("off → on needs an opening count", startsTracking(false, true), true);
check("on → on does not", startsTracking(true, true), false);
check("on → off does not", startsTracking(true, false), false);
check("off → off does not", startsTracking(false, false), false);

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

// --- stock filter (Items page, ?stock=) -------------------------------
check("the filter's URL key", STOCK_FILTER_PARAM, "stock");
check("?stock=low", parseStockFilter("low"), "LOW");
check("?stock=out", parseStockFilter("out"), "OUT");
check("?stock=in", parseStockFilter("in"), "IN_STOCK");
check("?stock=untracked", parseStockFilter("untracked"), "UNTRACKED");
check("a missing param is ALL", parseStockFilter(undefined), "ALL");
check("junk is ALL", parseStockFilter("LOW; drop"), "ALL");
check("a repeated param is ALL", parseStockFilter(["low", "out"]), "ALL");
check("ALL matches anything", matchesStockFilter(untracked, "ALL"), true);
check("LOW matches a low item", matchesStockFilter(tracked(2), "LOW"), true);
check("LOW skips an out item", matchesStockFilter(tracked(0), "LOW"), false);
check(
  "UNTRACKED matches only untracked",
  [
    matchesStockFilter(untracked, "UNTRACKED"),
    matchesStockFilter(tracked(50), "UNTRACKED"),
  ],
  [true, false],
);
check(
  "countByStatus counts tracked items only",
  countByStatus([tracked(50), tracked(5), tracked(0), tracked(0), untracked]),
  { IN_STOCK: 1, LOW: 1, OUT: 2, tracked: 4 },
);

// --- describeMovement (Recent changes list) ---------------------------
const movement = (patch: Partial<StockMovementRow>): StockMovementRow => ({
  id: "m",
  type: "RESTOCK",
  quantityDelta: 24,
  quantityAfter: 48,
  note: null,
  createdAt: "2026-10-19T04:30:00.000Z",
  createdByName: "Shop Owner",
  billNumber: null,
  ...patch,
});
check("a restock reads as a gain", describeMovement(movement({})), {
  label: "Restock",
  change: "+24",
  tone: "up",
});
check(
  "a sale names its bill",
  describeMovement(
    movement({ type: "SALE", quantityDelta: -2, billNumber: 41 }),
  ),
  { label: "Bill #41", change: "−2", tone: "down" },
);
check(
  "an opening count is not shown as a jump",
  describeMovement(
    movement({ type: "OPENING", quantityDelta: 25, quantityAfter: 30 }),
  ),
  { label: "Opening count", change: "30", tone: "neutral" },
);
check(
  "wastage reads as a loss",
  describeMovement(movement({ type: "WASTAGE", quantityDelta: -3 })),
  { label: "Wastage", change: "−3", tone: "down" },
);
check(
  "a correction keeps its sign",
  describeMovement(movement({ type: "CORRECTION", quantityDelta: -6 })),
  { label: "Count correction", change: "−6", tone: "down" },
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

// --- the till's cart --------------------------------------------------
const coke = menuItem("a", "Coke", tracked(2));
const added = cartReducer(cartReducer([], { type: "ADD", item: coke }), {
  type: "ADD",
  item: coke,
});
check("adding up to the stock works", added[0]?.quantity, 2);
check(
  "adding past the stock is refused",
  cartReducer(added, { type: "ADD", item: coke }),
  added,
);
check(
  "typing a quantity above the stock clamps to it",
  cartReducer(added, { type: "SET_QUANTITY", itemId: "a", quantity: 9 })[0]
    ?.quantity,
  2,
);
check(
  "SYNC_MENU applies clampLinesToMenu",
  cartReducer(added, {
    type: "SYNC_MENU",
    menu: menu([menuItem("a", "Coke", tracked(1))]),
  }),
  [{ ...line("a", "Coke", 1), maxQuantity: 1 }],
);
check("at the cap", atStockCap(coke, 2), true);
check("below the cap", atStockCap(coke, 1), false);
check(
  "an untracked item is never at a stock cap",
  atStockCap(menuItem("b", "Fries", untracked), 50),
  false,
);
check(
  "Enter never auto-adds an out-of-stock item",
  topSearchMatch(
    menu([
      menuItem("x", "Coke Small", tracked(0)),
      menuItem("y", "Coke Large", tracked(4)),
    ]),
    "coke",
  )?.id,
  "y",
);

console.log(
  failures === 0
    ? "\nAll stock helper checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
