import { MENU_CARD } from "./menu-import/menu-card-2026-08-11";
import {
  type CurrentMenu,
  type ExistingItem,
  type MenuCardCategory,
  type MenuPlan,
  planImport,
  validateCard,
} from "./menu-import/plan";

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

/** The validation message for a card, or null when it is accepted. */
function rejectionOf(card: MenuCardCategory[]): string | null {
  try {
    validateCard(card);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const ADD = { replace: false };
const REPLACE = { replace: true };

function names(plan: MenuPlan, action: "add" | "skip" | "keep"): string[] {
  return plan.categories.flatMap((group) =>
    group.items.filter((item) => item.action === action).map((i) => i.name),
  );
}

function statusOf(plan: MenuPlan, name: string) {
  return plan.categories.find((group) => group.name === name)?.category;
}

/** "add", "keep", "skip", or "skip, differs" for a flagged skip. */
function outcomeOf(plan: MenuPlan, name: string): string | undefined {
  const item = plan.categories
    .flatMap((group) => group.items)
    .find((candidate) => candidate.name === name);
  if (!item || item.action !== "skip") return item?.action;
  return item.differs ? "skip, differs" : "skip";
}

function retired(plan: MenuPlan) {
  return {
    categories: plan.retire.categories.map((category) => category.name),
    items: plan.retire.items.map((item) => item.name),
  };
}

function item(
  id: string,
  name: string,
  price: string,
  category: { id: string; name: string },
  sortOrder: number,
): ExistingItem {
  return {
    id,
    name,
    price,
    categoryId: category.id,
    categoryName: category.name,
    sortOrder,
  };
}

const EMPTY: CurrentMenu = { categories: [], items: [] };

// --- the menu card itself ----------------------------------------------
const card = validateCard(MENU_CARD);
check("the card passes validation", rejectionOf(MENU_CARD), null);
check("the card has 10 categories", card.length, 10);
check(
  "the card has 38 items",
  card.reduce((sum, group) => sum + group.items.length, 0),
  38,
);
check(
  "every price is a two-decimal string",
  card.every((group) =>
    group.items.every((line) => /^\d+\.\d{2}$/.test(line.price)),
  ),
  true,
);

// --- validation ---------------------------------------------------------
check(
  "names are trimmed and prices normalised",
  validateCard([{ name: " Tea ", items: [{ name: " Chai ", price: "20" }] }]),
  [{ name: "Tea", items: [{ name: "Chai", price: "20.00" }] }],
);
check(
  "the same dish twice is rejected, despite case, spacing and punctuation",
  rejectionOf([
    { name: "Burgers", items: [{ name: "Fish Burger", price: "180" }] },
    { name: "Specials", items: [{ name: "fish-burger ", price: "190" }] },
  ])?.includes("same dish"),
  true,
);
check(
  "a category listed twice is rejected",
  rejectionOf([
    { name: "Fries", items: [{ name: "Salted Fries", price: "70" }] },
    { name: "FRIES", items: [{ name: "Cheese Fries", price: "150" }] },
  ])?.includes("listed twice"),
  true,
);
check(
  "a float-looking price with three decimals is rejected",
  rejectionOf([{ name: "A", items: [{ name: "B", price: "60.505" }] }]) !==
    null,
  true,
);
check(
  "a negative or non-numeric price is rejected",
  [
    rejectionOf([{ name: "A", items: [{ name: "B", price: "-5" }] }]) !== null,
    rejectionOf([{ name: "A", items: [{ name: "B", price: "abc" }] }]) !== null,
  ],
  [true, true],
);
check(
  "an empty category is rejected",
  rejectionOf([{ name: "Empty", items: [] }])?.includes("no items"),
  true,
);

// --- fixtures -----------------------------------------------------------
// The db:seed sample menu.
const burgers = { id: "burgers", name: "Burgers", sortOrder: 1 };
const sides = { id: "sides", name: "Sides", sortOrder: 2 };
const drinks = { id: "drinks", name: "Drinks", sortOrder: 3 };
const sample: CurrentMenu = {
  categories: [burgers, sides, drinks],
  items: [
    item("veg", "Veg Burger", "60.00", burgers, 0),
    item("cheese", "Cheese Burger", "80.00", burgers, 1),
    item("chicken", "Chicken Burger", "110.00", burgers, 2),
    item("fries", "French Fries", "40.00", sides, 0),
    item("peri", "Peri Peri Fries", "50.00", sides, 1),
    item("coke", "Coke Small", "30.00", drinks, 0),
  ],
};

/** The menu exactly as a replace leaves it. */
const asImported: CurrentMenu = {
  categories: card.map((group, position) => ({
    id: `category-${position}`,
    name: group.name,
    sortOrder: position,
  })),
  items: card.flatMap((group, position) =>
    group.items.map((line, sortOrder) =>
      item(
        `${position}-${sortOrder}`,
        line.name,
        line.price,
        { id: `category-${position}`, name: group.name },
        sortOrder,
      ),
    ),
  ),
};

// --- add mode: an empty database ----------------------------------------
const fresh = planImport(card, EMPTY, ADD);
check(
  "add: on an empty menu every item is added",
  names(fresh, "add").length,
  38,
);
check(
  "add: new categories are numbered in card order",
  fresh.categories.map(({ category }) =>
    category.status === "new" ? category.sortOrder : null,
  ),
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
);
check(
  "add: new items are numbered from zero in card order",
  fresh.categories[0].items.map((line) =>
    line.action === "add" ? line.sortOrder : null,
  ),
  [0, 1, 2, 3, 4],
);
check("add: never retires anything", retired(fresh), {
  categories: [],
  items: [],
});

// --- add mode: running it twice -----------------------------------------
const addAgain = planImport(card, asImported, ADD);
check("add: a second run adds nothing", names(addAgain, "add"), []);
check(
  "add: a second run creates no category",
  addAgain.categories.every(({ category }) => category.status === "existing"),
  true,
);

// --- add mode: on the sample menu ---------------------------------------
const addOnSample = planImport(card, sample, ADD);
check(
  "add: an existing category is reused, not duplicated",
  statusOf(addOnSample, "Burgers"),
  { status: "existing", id: "burgers" },
);
check(
  "add: new items go after the existing items in their category",
  addOnSample.categories[0].items.map((line) =>
    line.action === "add" ? line.sortOrder : null,
  ),
  [3, 4, 5, 6, 7],
);
check(
  "add: new categories go after the existing ones",
  statusOf(addOnSample, "Rice Bowl"),
  { status: "new", sortOrder: 4 },
);
check(
  "add: a dish already in another category is skipped and flagged",
  outcomeOf(addOnSample, "Peri Peri Fries"),
  "skip, differs",
);
check(
  "add: the rest of the card is added",
  names(addOnSample, "add").length,
  37,
);
check("add: leaves the sample menu alone", retired(addOnSample), {
  categories: [],
  items: [],
});

// --- add mode: spelling variants ----------------------------------------
const lowerBurgers = { id: "b", name: "burgers", sortOrder: 0 };
const variants = planImport(
  card,
  {
    categories: [lowerBurgers],
    items: [
      item("g", "chicken  ginger BURGER", "130.00", lowerBurgers, 0),
      item("d", "Double Decker / Open Burger", "210.00", lowerBurgers, 5),
    ],
  },
  ADD,
);
check(
  "add: an existing category keeps the owner's spelling",
  variants.categories[0].name,
  "burgers",
);
check(
  "add: case and spacing do not hide a duplicate; same price is not flagged",
  outcomeOf(variants, "Chicken Ginger Burger"),
  "skip",
);
check(
  "add: punctuation does not hide a duplicate; a new price is flagged",
  outcomeOf(variants, "Double Decker/Open Burger"),
  "skip, differs",
);
check(
  "add: numbering continues after the highest existing number, past any gap",
  variants.categories[0].items.flatMap((line) =>
    line.action === "add" ? [line.sortOrder] : [],
  ),
  [6, 7, 8],
);

// --- add mode: a category that would be empty ---------------------------
const snacks = { id: "s", name: "Snacks", sortOrder: 0 };
const unneeded = planImport(
  card,
  {
    categories: [snacks],
    items: [item("p", "Chicken Pizza (6 inch)", "120.00", snacks, 0)],
  },
  ADD,
);
check(
  "add: a new category whose items all exist elsewhere is not created",
  statusOf(unneeded, "Pizza"),
  { status: "unneeded" },
);
check(
  "add: and it does not use up a sort number",
  [statusOf(unneeded, "Sandwich"), statusOf(unneeded, "Fries")],
  [
    { status: "new", sortOrder: 3 },
    { status: "new", sortOrder: 4 },
  ],
);

// --- replace mode: on the sample menu -----------------------------------
const replaceSample = planImport(card, sample, REPLACE);
check(
  "replace: retires every current category and item",
  retired(replaceSample),
  {
    categories: ["Burgers", "Sides", "Drinks"],
    items: [
      "Veg Burger",
      "Cheese Burger",
      "Chicken Burger",
      "French Fries",
      "Peri Peri Fries",
      "Coke Small",
    ],
  },
);
check(
  "replace: carries nothing over, not even a same-named category",
  statusOf(replaceSample, "Burgers"),
  { status: "new", sortOrder: 0 },
);
check(
  "replace: a dish on both menus is created fresh at the card's price",
  outcomeOf(replaceSample, "Peri Peri Fries"),
  "add",
);
check(
  "replace: every card item is added",
  names(replaceSample, "add").length,
  38,
);
check(
  "replace: categories are numbered in card order",
  replaceSample.categories.map(({ category }) =>
    category.status === "new" ? category.sortOrder : null,
  ),
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
);

// --- replace mode: running it twice -------------------------------------
const replaceAgain = planImport(card, asImported, REPLACE);
check("replace: a second run retires nothing", retired(replaceAgain), {
  categories: [],
  items: [],
});
check("replace: a second run adds nothing", names(replaceAgain, "add"), []);
check(
  "replace: a second run keeps every category in place",
  replaceAgain.categories.every(
    ({ category }) =>
      category.status === "keep" &&
      category.existing.sortOrder === category.sortOrder,
  ),
  true,
);
check(
  "replace: a second run keeps every item in place",
  replaceAgain.categories.every((group) =>
    group.items.every(
      (line) =>
        line.action === "keep" && line.existing.sortOrder === line.sortOrder,
    ),
  ),
  true,
);

// --- replace mode: a menu that has drifted from the card ----------------
const [importedBurgers] = asImported.categories;
const drifted: CurrentMenu = {
  categories: [
    { ...importedBurgers, sortOrder: 7 },
    ...asImported.categories.slice(1),
    { id: "drinks", name: "Drinks", sortOrder: 10 },
  ],
  items: [
    // The burgers, in reverse order.
    ...asImported.items
      .filter((line) => line.categoryId === importedBurgers.id)
      .map((line, index) => ({ ...line, sortOrder: 4 - index })),
    // Re-priced in the admin since the import.
    ...asImported.items
      .filter((line) => line.categoryId !== importedBurgers.id)
      .map((line) =>
        line.name === "Fish Bowl" ? { ...line, price: "190.00" } : line,
      ),
    item("veg", "Veg Burger", "60.00", importedBurgers, 5),
    item("coke", "Coke Small", "30.00", { id: "drinks", name: "Drinks" }, 0),
    // Left active in a category that was retired some time ago.
    item("ghost", "Old Special", "99.00", { id: "gone", name: "Gone" }, 0),
  ],
};
const replaceDrifted = planImport(card, drifted, REPLACE);
check(
  "replace: retires what is not on the card, including orphaned items",
  retired(replaceDrifted),
  {
    categories: ["Drinks"],
    items: ["Fish Bowl", "Veg Burger", "Coke Small", "Old Special"],
  },
);
check(
  "replace: a re-priced item is replaced at the card's price",
  outcomeOf(replaceDrifted, "Fish Bowl"),
  "add",
);
check(
  "replace: a kept category moves back to its place on the card",
  statusOf(replaceDrifted, "Burgers"),
  { status: "keep", existing: drifted.categories[0], sortOrder: 0 },
);
check(
  "replace: kept items move back into card order",
  replaceDrifted.categories[0].items.map((line) =>
    line.action === "keep" ? [line.existing.sortOrder, line.sortOrder] : null,
  ),
  [
    [4, 0],
    [3, 1],
    [2, 2],
    [1, 3],
    [0, 4],
  ],
);

// --- replace mode: exact matches only -----------------------------------
const lowerOnly = planImport(
  card,
  {
    categories: [lowerBurgers],
    items: [item("g", "Chicken Ginger Burger", "130.00", lowerBurgers, 0)],
  },
  REPLACE,
);
check(
  "replace: a differently spelled category is retired and created fresh",
  [retired(lowerOnly), statusOf(lowerOnly, "Burgers")],
  [
    { categories: ["burgers"], items: ["Chicken Ginger Burger"] },
    { status: "new", sortOrder: 0 },
  ],
);

// --- add mode ignores orphaned items ------------------------------------
check(
  "add: an item left in a retired category does not count as on the menu",
  outcomeOf(
    planImport(
      card,
      {
        categories: [],
        items: [
          item("ghost", "Fish Burger", "180.00", { id: "x", name: "X" }, 0),
        ],
      },
      ADD,
    ),
    "Fish Burger",
  ),
  "add",
);

console.log(
  failures === 0
    ? "\nAll menu import checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
