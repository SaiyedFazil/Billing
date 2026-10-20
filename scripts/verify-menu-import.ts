import { MENU_CARD } from "./menu-import/menu-card-2026-08-11";
import {
  type CategoryPlan,
  type CurrentMenu,
  type MenuCardCategory,
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

function adds(plan: CategoryPlan[]): string[] {
  return plan.flatMap((group) =>
    group.items.filter((item) => item.action === "add").map((i) => i.name),
  );
}

function statusOf(plan: CategoryPlan[], name: string) {
  return plan.find((group) => group.name === name)?.category;
}

function itemIn(plan: CategoryPlan[], name: string) {
  return plan
    .flatMap((group) => group.items)
    .find((item) => item.name === name);
}

/** "add", "skip", or "skip, differs" for a skipped dish that was flagged. */
function outcomeOf(plan: CategoryPlan[], name: string): string | undefined {
  const item = itemIn(plan, name);
  if (!item || item.action === "add") return item?.action;
  return item.differs ? "skip, differs" : "skip";
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
    group.items.every((item) => /^\d+\.\d{2}$/.test(item.price)),
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

// --- an empty database --------------------------------------------------
const fresh = planImport(card, EMPTY);
check("on an empty menu every item is added", adds(fresh).length, 38);
check(
  "new categories are numbered in card order",
  fresh.map((group) =>
    group.category.status === "new" ? group.category.sortOrder : null,
  ),
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
);
check(
  "new items are numbered from zero in card order",
  fresh[0].items.map((item) => (item.action === "add" ? item.sortOrder : null)),
  [0, 1, 2, 3, 4],
);

// --- running it twice ---------------------------------------------------
// The menu as the first run leaves it.
const afterFirstRun: CurrentMenu = {
  categories: fresh.map((group, index) => ({
    id: `category-${index}`,
    name: group.name,
    sortOrder: index,
  })),
  items: fresh.flatMap((group, index) =>
    group.items.map((item, position) => ({
      name: item.name,
      price: item.price,
      categoryId: `category-${index}`,
      categoryName: group.name,
      sortOrder: position,
    })),
  ),
};
const rerun = planImport(card, afterFirstRun);
check("a second run adds nothing", adds(rerun), []);
check(
  "a second run creates no category",
  rerun.every((group) => group.category.status === "existing"),
  true,
);
check(
  "a second run reports nothing as different",
  rerun.some((group) =>
    group.items.some((item) => item.action === "skip" && item.differs),
  ),
  false,
);

// --- a database holding the db:seed sample menu -------------------------
const sample: CurrentMenu = {
  categories: [
    { id: "burgers", name: "Burgers", sortOrder: 1 },
    { id: "sides", name: "Sides", sortOrder: 2 },
    { id: "drinks", name: "Drinks", sortOrder: 3 },
  ],
  items: [
    ["Veg Burger", "60.00", "burgers", "Burgers", 0],
    ["Cheese Burger", "80.00", "burgers", "Burgers", 1],
    ["Chicken Burger", "110.00", "burgers", "Burgers", 2],
    ["French Fries", "40.00", "sides", "Sides", 0],
    ["Peri Peri Fries", "50.00", "sides", "Sides", 1],
    ["Coke Small", "30.00", "drinks", "Drinks", 0],
  ].map(([name, price, categoryId, categoryName, sortOrder]) => ({
    name: name as string,
    price: price as string,
    categoryId: categoryId as string,
    categoryName: categoryName as string,
    sortOrder: sortOrder as number,
  })),
};
const onSample = planImport(card, sample);
check(
  "an existing category is reused, not duplicated",
  statusOf(onSample, "Burgers"),
  { status: "existing", id: "burgers" },
);
check(
  "new items go after the existing items in their category",
  onSample[0].items.map((item) =>
    item.action === "add" ? item.sortOrder : null,
  ),
  [3, 4, 5, 6, 7],
);
check(
  "new categories go after the existing ones",
  statusOf(onSample, "Rice Bowl"),
  { status: "new", sortOrder: 4 },
);
check(
  "a dish already in another category is skipped and flagged",
  itemIn(onSample, "Peri Peri Fries"),
  {
    name: "Peri Peri Fries",
    price: "80.00",
    action: "skip",
    existing: sample.items[4],
    differs: true,
  },
);
check("the rest of the card is added", adds(onSample).length, 37);

// --- spelling variants of what is already there -------------------------
const variants = planImport(card, {
  categories: [{ id: "b", name: "burgers", sortOrder: 0 }],
  items: [
    {
      name: "chicken  ginger BURGER",
      price: "130.00",
      categoryId: "b",
      categoryName: "burgers",
      sortOrder: 0,
    },
    {
      name: "Double Decker / Open Burger",
      price: "210.00",
      categoryId: "b",
      categoryName: "burgers",
      sortOrder: 5,
    },
  ],
});
check(
  "an existing category keeps the owner's spelling",
  variants[0].name,
  "burgers",
);
check(
  "case and spacing do not hide a duplicate; same price is not flagged",
  outcomeOf(variants, "Chicken Ginger Burger"),
  "skip",
);
check(
  "punctuation does not hide a duplicate; a new price is flagged",
  outcomeOf(variants, "Double Decker/Open Burger"),
  "skip, differs",
);
check(
  "numbering continues after the highest existing number, past any gap",
  variants[0].items.flatMap((item) =>
    item.action === "add" ? [item.sortOrder] : [],
  ),
  [6, 7, 8],
);

// --- a category that would be empty -------------------------------------
const unneeded = planImport(card, {
  categories: [{ id: "s", name: "Snacks", sortOrder: 0 }],
  items: [
    {
      name: "Chicken Pizza (6 inch)",
      price: "120.00",
      categoryId: "s",
      categoryName: "Snacks",
      sortOrder: 0,
    },
  ],
});
check(
  "a new category whose items all exist elsewhere is not created",
  statusOf(unneeded, "Pizza"),
  { status: "unneeded" },
);
check(
  "and it does not use up a sort number",
  [statusOf(unneeded, "Sandwich"), statusOf(unneeded, "Fries")],
  [
    { status: "new", sortOrder: 3 },
    { status: "new", sortOrder: 4 },
  ],
);

console.log(
  failures === 0
    ? "\nAll menu import checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
