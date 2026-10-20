import {
  AUDIT_ACTION_LABELS,
  AUDIT_ACTIONS,
} from "../src/constants/audit-actions";
import { describeAuditEntry } from "../src/lib/utils/audit-details";
import type {
  AuditDetails,
  AuditLogEntry,
  AuditRefs,
} from "../src/types/audit.types";

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

const ITEM = "11111111-1111-4111-8111-111111111111";
const CATEGORY = "22222222-2222-4222-8222-222222222222";
const OTHER_CATEGORY = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const EXPENSE = "55555555-5555-4555-8555-555555555555";
const EXPENSE_CATEGORY = "66666666-6666-4666-8666-666666666666";

const REFS: AuditRefs = {
  [ITEM]: "Fish Bowl",
  [CATEGORY]: "Bowl",
  [OTHER_CATEGORY]: "Mobito Specials",
  [USER]: "Ravi",
  [EXPENSE]: "₹1,250.00 · Vegetables · Ravi",
  [EXPENSE_CATEGORY]: "Vegetables",
};

function entry(
  action: string,
  entityType: string,
  before: unknown,
  after: unknown,
  overrides: Partial<AuditLogEntry> = {},
): AuditLogEntry {
  return {
    id: "row",
    action,
    entityType,
    entityId: null,
    before,
    after,
    createdAt: new Date("2026-10-21T03:06:00Z"),
    actorName: "Shop Owner",
    ...overrides,
  };
}

/** The summary as the owner reads it, bold runs included. */
function sentence(details: AuditDetails): string {
  return details.summary
    .map((part) => (typeof part === "string" ? part : part.strong))
    .join("");
}

const changes = (details: AuditDetails) =>
  details.changes.map(
    (c) =>
      `${c.label}: ${c.before} → ${c.after}${c.delta ? ` (${c.delta.text})` : ""}`,
  );
const facts = (details: AuditDetails) =>
  details.facts.map((f) => `${f.label}: ${f.value}`);

// --- items ----------------------------------------------------------------
const itemCreated = describeAuditEntry(
  entry(
    "ITEM_CREATED",
    "item",
    null,
    {
      name: "Mobito Jumbo Bowl",
      price: "300.00",
      source: "menu-card-2026-08-11",
      sortOrder: 2,
      categoryId: OTHER_CATEGORY,
    },
    { entityId: ITEM, actorName: null },
  ),
  REFS,
);
check(
  "item created by the import reads as the import",
  sentence(itemCreated),
  "The menu card import added Mobito Jumbo Bowl to Mobito Specials at ₹300.00.",
);
check(
  "its details name the category and hide the import marker",
  facts(itemCreated),
  [
    "Name: Mobito Jumbo Bowl",
    "Category: Mobito Specials",
    "Price: ₹300.00",
    "Display order: 2",
  ],
);
check("it is flagged as imported", itemCreated.imported, true);
check("with a note saying so", itemCreated.notes, [
  "Added automatically by the menu card import of 11 Aug 2026.",
]);
check(
  "its subject names the item",
  itemCreated.subject,
  "Item · Mobito Jumbo Bowl",
);
check("tone", itemCreated.tone, "created");

const itemEdited = describeAuditEntry(
  entry(
    "ITEM_UPDATED",
    "item",
    {
      name: "Fish Bowl",
      price: "180.00",
      imageUrl: null,
      sortOrder: 1,
      categoryId: CATEGORY,
      isAvailable: true,
      trackStock: false,
      lowStockThreshold: 10,
    },
    {
      name: "Fish Bowl",
      price: "180",
      imageUrl: "https://ik.imagekit.io/x/fish.jpg",
      imageFileId: "file_123",
      sortOrder: 1,
      categoryId: OTHER_CATEGORY,
      isAvailable: true,
      trackStock: true,
      lowStockThreshold: 0,
      openingStock: 12,
    },
    { entityId: ITEM },
  ),
  REFS,
);
check(
  "an item edit lists only what changed, in form order",
  changes(itemEdited),
  [
    "Category: Bowl → Mobito Specials",
    "Photo: No photo → Has a photo",
    "Track stock: Off → On",
    "Low-stock alert at: 10 → Never",
  ],
);
check(
  "an unchanged price written differently is not a change",
  itemEdited.changes.some((c) => c.key === "price"),
  false,
);
check("a value only the new side records is a detail", facts(itemEdited), [
  "Opening stock: 12",
]);
check(
  "summary counts the changes",
  sentence(itemEdited),
  "Shop Owner updated Fish Bowl (4 changes).",
);

check(
  "a new photo replacing an old one says so",
  changes(
    describeAuditEntry(
      entry(
        "ITEM_UPDATED",
        "item",
        { name: "Fish Bowl", imageUrl: "https://a/old.jpg" },
        { name: "Fish Bowl", imageUrl: "https://a/new.jpg" },
      ),
      REFS,
    ),
  ),
  ["Photo: Old photo → New photo"],
);

check(
  "sold out reads as a sentence",
  sentence(
    describeAuditEntry(
      entry(
        "ITEM_UPDATED",
        "item",
        { isAvailable: true },
        { isAvailable: false },
        { entityId: ITEM },
      ),
      REFS,
    ),
  ),
  "Shop Owner marked Fish Bowl as sold out.",
);

const priceUp = describeAuditEntry(
  entry(
    "ITEM_PRICE_CHANGED",
    "item",
    { price: "180.00" },
    { price: "190.00" },
    { entityId: ITEM },
  ),
  REFS,
);
check(
  "a price change names the item from refs",
  sentence(priceUp),
  "Shop Owner changed the price of Fish Bowl from ₹180.00 to ₹190.00.",
);
check("and shows the difference", changes(priceUp), [
  "Price: ₹180.00 → ₹190.00 (+₹10.00)",
]);
check(
  "a price cut shows a minus",
  changes(
    describeAuditEntry(
      entry(
        "ITEM_PRICE_CHANGED",
        "item",
        { price: "200.00" },
        { price: "150.50" },
      ),
      REFS,
    ),
  ),
  ["Price: ₹200.00 → ₹150.50 (−₹49.50)"],
);

const itemRemoved = describeAuditEntry(
  entry(
    "ITEM_DELETED",
    "item",
    { name: "Veg Burger", price: "60.00" },
    { source: "menu-card-2026-08-11" },
  ),
  REFS,
);
check(
  "a removed item",
  [sentence(itemRemoved), itemRemoved.factsTitle, facts(itemRemoved)],
  [
    "The menu card import removed Veg Burger from the menu.",
    "What was removed",
    ["Name: Veg Burger", "Price: ₹60.00"],
  ],
);
check(
  "its notes explain the import and that history is kept",
  itemRemoved.notes,
  [
    "Removed automatically when the menu card of 11 Aug 2026 replaced the menu.",
    "Taken off the menu, not deleted: past bills and reports still show it.",
  ],
);

// --- stock ----------------------------------------------------------------
const stock = describeAuditEntry(
  entry(
    "STOCK_ADJUSTED",
    "item",
    { stockQuantity: 13 },
    { mode: "SET", note: "probe", reason: "CORRECTION", stockQuantity: 7 },
    { entityId: ITEM },
  ),
  REFS,
);
check(
  "a stock count correction",
  [sentence(stock), changes(stock), facts(stock)],
  [
    "Shop Owner corrected the stock count of Fish Bowl, from 13 to 7.",
    ["In stock: 13 → 7 (−6)"],
    ["How: Set count", "Reason: Count correction", "Note: probe"],
  ],
);
check(
  "a restock",
  sentence(
    describeAuditEntry(
      entry(
        "STOCK_ADJUSTED",
        "item",
        { stockQuantity: 2 },
        { mode: "ADD", note: null, reason: "RESTOCK", stockQuantity: 26 },
        { entityId: ITEM },
      ),
      REFS,
    ),
  ),
  "Shop Owner restocked Fish Bowl, from 2 to 26.",
);

// --- categories -----------------------------------------------------------
check(
  "category created",
  sentence(
    describeAuditEntry(
      entry("CATEGORY_CREATED", "category", null, {
        name: "Rice Bowl",
        sortOrder: 1,
      }),
      REFS,
    ),
  ),
  "Shop Owner added the category Rice Bowl.",
);
check(
  "category renamed",
  sentence(
    describeAuditEntry(
      entry(
        "CATEGORY_UPDATED",
        "category",
        { name: "Bowls", sortOrder: 6 },
        { name: "Bowl", sortOrder: 6 },
      ),
      REFS,
    ),
  ),
  "Shop Owner renamed the category Bowls to Bowl.",
);
const categoryMoved = describeAuditEntry(
  entry(
    "CATEGORY_UPDATED",
    "category",
    { sortOrder: 1 },
    { sortOrder: 0, source: "menu-card-2026-08-11" },
    { entityId: CATEGORY },
  ),
  REFS,
);
check(
  "category reordered by the import",
  [sentence(categoryMoved), changes(categoryMoved)],
  ["The menu card import updated the category Bowl.", ["Display order: 1 → 0"]],
);
check(
  "category removed",
  sentence(
    describeAuditEntry(
      entry(
        "CATEGORY_DELETED",
        "category",
        { name: "Sides", sortOrder: 2 },
        null,
      ),
      REFS,
    ),
  ),
  "Shop Owner removed the category Sides.",
);

// --- expenses -------------------------------------------------------------
const expenseAdded = describeAuditEntry(
  entry("EXPENSE_CREATED", "expense", null, {
    note: null,
    mode: "UPI",
    amount: "1250.00",
    paidTo: "Ravi",
    expenseDate: "2026-10-20",
    categoryName: "Vegetables",
  }),
  REFS,
);
check(
  "expense added",
  [sentence(expenseAdded), facts(expenseAdded)],
  [
    "Shop Owner added an expense of ₹1,250.00 for Vegetables, paid to Ravi.",
    [
      "Date: 20 Oct 2026",
      "Amount: ₹1,250.00",
      "Category: Vegetables",
      "Paid by: UPI",
      "Paid to: Ravi",
    ],
  ],
);
const expenseEdited = describeAuditEntry(
  entry(
    "EXPENSE_UPDATED",
    "expense",
    {
      expenseDate: "2026-10-20",
      amount: "1250.00",
      mode: "UPI",
      categoryId: EXPENSE_CATEGORY,
      paidTo: "Ravi",
      note: null,
    },
    {
      expenseDate: "2026-10-20",
      amount: "1200.00",
      mode: "CASH",
      categoryId: EXPENSE_CATEGORY,
      paidTo: "Ravi",
      note: "Haggled",
    },
    { entityId: EXPENSE },
  ),
  REFS,
);
check(
  "expense edited",
  [sentence(expenseEdited), changes(expenseEdited)],
  [
    "Shop Owner edited the expense ₹1,250.00 · Vegetables · Ravi (3 changes).",
    [
      "Amount: ₹1,250.00 → ₹1,200.00 (−₹50.00)",
      "Paid by: UPI → Cash",
      "Note: — → Haggled",
    ],
  ],
);
const expenseCancelled = describeAuditEntry(
  entry(
    "EXPENSE_CANCELLED",
    "expense",
    null,
    { reason: "Entered twice" },
    { entityId: EXPENSE },
  ),
  REFS,
);
check(
  "expense cancelled",
  [
    sentence(expenseCancelled),
    expenseCancelled.factsTitle,
    facts(expenseCancelled),
  ],
  [
    "Shop Owner cancelled the expense ₹1,250.00 · Vegetables · Ravi.",
    "Details",
    ["Reason for cancelling: Entered twice"],
  ],
);
check(
  "expense category added, renamed, retired",
  [
    sentence(
      describeAuditEntry(
        entry("EXPENSE_CATEGORY_CREATED", "expense_category", null, {
          name: "Gas",
        }),
        REFS,
      ),
    ),
    sentence(
      describeAuditEntry(
        entry(
          "EXPENSE_CATEGORY_UPDATED",
          "expense_category",
          { name: "Veg" },
          { name: "Vegetables" },
        ),
        REFS,
      ),
    ),
    sentence(
      describeAuditEntry(
        entry(
          "EXPENSE_CATEGORY_RETIRED",
          "expense_category",
          { name: "Gas" },
          null,
        ),
        REFS,
      ),
    ),
  ],
  [
    "Shop Owner added the expense category Gas.",
    "Shop Owner renamed the expense category Veg to Vegetables.",
    "Shop Owner retired the expense category Gas.",
  ],
);

// --- accounts and sign-in -------------------------------------------------
const userAdded = describeAuditEntry(
  entry("USER_CREATED", "user", null, {
    name: "Ravi",
    role: "ADMIN",
    username: "ravi",
  }),
  REFS,
);
check(
  "user created",
  [sentence(userAdded), facts(userAdded)],
  [
    "Shop Owner added Ravi as a Cashier.",
    ["Name: Ravi", "Username: ravi", "Role: Cashier"],
  ],
);
const deactivated = describeAuditEntry(
  entry(
    "USER_DEACTIVATED",
    "user",
    { isActive: true },
    { isActive: false },
    { entityId: USER },
  ),
  REFS,
);
check(
  "user deactivated",
  [sentence(deactivated), changes(deactivated), deactivated.tone],
  ["Shop Owner deactivated Ravi.", ["Status: Active → Deactivated"], "removed"],
);
check(
  "user reactivated",
  sentence(
    describeAuditEntry(
      entry(
        "USER_UPDATED",
        "user",
        { isActive: false },
        { isActive: true },
        { entityId: USER },
      ),
      REFS,
    ),
  ),
  "Shop Owner reactivated Ravi.",
);
const reset = describeAuditEntry(
  entry(
    "USER_PASSWORD_RESET",
    "user",
    null,
    { username: "ravi" },
    { entityId: USER },
  ),
  REFS,
);
check(
  "password reset never shows a password",
  [sentence(reset), reset.notes],
  [
    "Shop Owner reset the password for Ravi.",
    ["The new password itself is never recorded."],
  ],
);
check(
  "password reset falls back to the username",
  sentence(
    describeAuditEntry(
      entry("USER_PASSWORD_RESET", "user", null, { username: "ravi" }),
      {},
    ),
  ),
  "Shop Owner reset the password for ravi.",
);
const failed = describeAuditEntry(
  entry(
    "LOGIN_FAILED",
    "user",
    null,
    { locked: false, failedAttempts: 3 },
    { entityId: USER, actorName: "Ravi" },
  ),
  REFS,
);
check(
  "failed sign-in",
  [sentence(failed), facts(failed), failed.notes, failed.tone],
  [
    "Someone entered the wrong password for Ravi.",
    ["Wrong passwords in a row: 3", "Account locked: No"],
    ["The account locks after 5 wrong passwords in a row."],
    "security",
  ],
);
const locked = describeAuditEntry(
  entry(
    "LOGIN_LOCKED",
    "user",
    null,
    { locked: true, failedAttempts: 5 },
    { entityId: USER },
  ),
  REFS,
);
check(
  "account locked",
  [sentence(locked), locked.notes],
  [
    "Ravi’s account was locked after 5 wrong passwords in a row.",
    ["It unlocks by itself after 5 minutes."],
  ],
);

// --- settings -------------------------------------------------------------
const settingsSnapshot = {
  phone: "98765 43210",
  shopName: "Mobito",
  timezone: "Asia/Kolkata",
  addressLine: "Jamalpur",
  printerWidth: "MM_80",
  receiptFooter: "Thank you! Visit again",
};
const logoOff = describeAuditEntry(
  entry(
    "SETTINGS_UPDATED",
    "shop_settings",
    { ...settingsSnapshot, receiptShowLogo: true },
    { ...settingsSnapshot, receiptShowLogo: false },
  ),
  REFS,
);
check(
  "one setting switched off: only that row, and a sentence",
  [sentence(logoOff), changes(logoOff), logoOff.subject],
  [
    "Shop Owner turned off “Logo on receipt”.",
    ["Logo on receipt: On → Off"],
    "Shop settings",
  ],
);
check(
  "one setting changed",
  sentence(
    describeAuditEntry(
      entry("SETTINGS_UPDATED", "shop_settings", settingsSnapshot, {
        ...settingsSnapshot,
        printerWidth: "MM_58",
      }),
      REFS,
    ),
  ),
  "Shop Owner changed the printer width from 80mm (standard) to 58mm (narrow).",
);
const payments = describeAuditEntry(
  entry(
    "SETTINGS_UPDATED",
    "shop_settings",
    { paymentMethods: ["CASH", "UPI", "CARD", "OTHER"] },
    { paymentMethods: ["CASH", "UPI"] },
  ),
  REFS,
);
check("payment methods read as names", changes(payments), [
  "Payment methods: Cash, UPI, Card, Other → Cash, UPI",
]);
check(
  "several settings",
  sentence(
    describeAuditEntry(
      entry("SETTINGS_UPDATED", "shop_settings", settingsSnapshot, {
        ...settingsSnapshot,
        phone: "1",
        shopName: "Mobito Jamalpur",
      }),
      REFS,
    ),
  ),
  "Shop Owner changed 2 settings.",
);
check(
  "a save that changed nothing says so",
  sentence(
    describeAuditEntry(
      entry(
        "SETTINGS_UPDATED",
        "shop_settings",
        settingsSnapshot,
        settingsSnapshot,
      ),
      REFS,
    ),
  ),
  "Shop Owner saved the shop settings without changing anything.",
);

// --- bills ----------------------------------------------------------------
const reprint = describeAuditEntry(
  entry("BILL_REPRINTED", "bill", null, {
    billNumber: 47,
    businessDate: "2026-08-26",
  }),
  REFS,
);
check(
  "bill reprinted",
  [sentence(reprint), reprint.subject, facts(reprint)],
  [
    "Shop Owner reprinted Bill #47 of 26 Aug 2026.",
    "Bill #47",
    ["Bill: #47", "Business day: 26 Aug 2026"],
  ],
);
check(
  "bill voided, even with nothing recorded",
  sentence(describeAuditEntry(entry("BILL_VOIDED", "bill", null, null), REFS)),
  "Shop Owner voided a bill.",
);

// --- robustness -----------------------------------------------------------
check(
  "every action has its own sentence, not the generic one",
  AUDIT_ACTIONS.filter(
    (action) =>
      sentence(describeAuditEntry(entry(action, "item", null, null), {})) ===
      `Shop Owner — ${AUDIT_ACTION_LABELS[action]}.`,
  ),
  [],
);
check(
  "a missing value never reads as “from — to —”",
  AUDIT_ACTIONS.filter((action) =>
    sentence(
      describeAuditEntry(entry(action, "item", null, null), {}),
    ).includes("—"),
  ),
  [],
);
check(
  "an unknown action still reads",
  sentence(
    describeAuditEntry(
      entry("SOMETHING_NEW", "widget", null, { fooBar: 1 }),
      {},
    ),
  ),
  "Shop Owner — SOMETHING_NEW.",
);
check(
  "an unknown field gets a readable label",
  facts(
    describeAuditEntry(
      entry("SOMETHING_NEW", "widget", null, { fooBar: 1 }),
      {},
    ),
  ),
  ["Foo bar: 1"],
);
let threw = false;
try {
  for (const action of AUDIT_ACTIONS) {
    for (const payload of [
      null,
      "text",
      42,
      [1, 2],
      { price: "abc" },
      { categoryId: 7 },
    ]) {
      describeAuditEntry(entry(action, "item", payload, payload), {});
    }
  }
} catch {
  threw = true;
}
check("malformed rows never throw", threw, false);
check(
  "an id with no known name reads as unknown, not as an id",
  facts(
    describeAuditEntry(
      entry("ITEM_CREATED", "item", null, { name: "X", categoryId: CATEGORY }),
      {},
    ),
  ),
  ["Name: X", "Category: Unknown category"],
);

console.log(
  failures === 0
    ? "\nAll audit details checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
