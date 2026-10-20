import type { ZodType } from "zod";

import { compare, toAmount } from "../../src/lib/utils/money";
import { categorySchema } from "../../src/lib/validation/category-schema";
import { itemSchema } from "../../src/lib/validation/item-schema";

/**
 * The pure half of `npm run db:import-menu`: checking a menu card and deciding
 * what to do with each line of it. No database access, so
 * `npm run verify:menu-import` can prove the rules offline.
 *
 * Two modes:
 *
 *   - add (default) only adds what is missing. A dish counts as already on the
 *     menu when an ACTIVE item in any category has the same name, ignoring
 *     case, spacing and punctuation — the same dish under two tabs is a
 *     duplicate to the cashier, even though the database would allow it. Such
 *     an item is left exactly as it is, and reported when its price or
 *     category differs from the card.
 *
 *   - replace makes the active menu exactly the card: every current item and
 *     category is retired and the card is created fresh. Retired, never
 *     deleted (CLAUDE.md rule 5) — past bills still point at those rows. The
 *     one exception is what is already exactly the card's (same name, price
 *     and category), which is kept, so running it twice changes nothing.
 */

export type MenuCardCategory = {
  name: string;
  items: Array<{ name: string; price: string }>;
};

export type ExistingCategory = { id: string; name: string; sortOrder: number };

export type ExistingItem = {
  id: string;
  name: string;
  price: string;
  categoryId: string;
  categoryName: string;
  sortOrder: number;
};

/** The active menu as the database holds it now. */
export type CurrentMenu = {
  categories: ExistingCategory[];
  items: ExistingItem[];
};

export type PlannedItem = { name: string; price: string } & (
  | { action: "add"; sortOrder: number }
  // Add mode: already on the menu, left alone. `differs` when its price or
  // category is not what the card says.
  | { action: "skip"; existing: ExistingItem; differs: boolean }
  // Replace mode: already exactly the card's; only its position may change.
  | { action: "keep"; existing: ExistingItem; sortOrder: number }
);

export type CategoryPlan = {
  name: string;
  category:
    // Add mode: reused as it is.
    | { status: "existing"; id: string }
    // Replace mode: already the card's; only its position may change.
    | { status: "keep"; existing: ExistingCategory; sortOrder: number }
    | { status: "new"; sortOrder: number }
    // Add mode: every item under it is already on the menu elsewhere, so
    // creating it would only add an empty tab to the till.
    | { status: "unneeded" };
  items: PlannedItem[];
};

export type MenuPlan = {
  categories: CategoryPlan[];
  /** Replace mode: the active categories and items to retire. */
  retire: CurrentMenu;
};

/**
 * What two names must share to be the same: their letters and digits.
 * "Double Decker / Open Burger" matches "double decker/open burger".
 */
export function matchKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The first message a schema rejects `value` with, or null when it passes. */
function rejection(schema: ZodType, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid");
}

/**
 * Holds the card to the rules the admin forms apply, and makes sure it lists
 * no dish or category twice. Returns it trimmed, with prices as "130.00".
 *
 * @throws listing every problem, so one run shows all of them.
 */
export function validateCard(card: MenuCardCategory[]): MenuCardCategory[] {
  const problems: string[] = [];
  const categoryKeys = new Set<string>();
  const itemKeys = new Map<string, string>();

  for (const group of card) {
    const nameProblem = rejection(categorySchema.shape.name, group.name);
    if (nameProblem) problems.push(`Category "${group.name}": ${nameProblem}`);

    const categoryKey = matchKey(group.name);
    if (!categoryKey) {
      problems.push(`Category "${group.name}" has no letters or digits`);
    } else if (categoryKeys.has(categoryKey)) {
      problems.push(`Category "${group.name}" is listed twice`);
    }
    categoryKeys.add(categoryKey);

    if (group.items.length === 0) {
      problems.push(`Category "${group.name}" has no items`);
    }

    for (const item of group.items) {
      const label = `"${group.name} > ${item.name}"`;
      for (const problem of [
        rejection(itemSchema.shape.name, item.name),
        rejection(itemSchema.shape.price, item.price),
      ]) {
        if (problem) problems.push(`${label}: ${problem}`);
      }

      const itemKey = matchKey(item.name);
      const earlier = itemKeys.get(itemKey);
      if (!itemKey) {
        problems.push(`${label} has no letters or digits`);
      } else if (earlier) {
        problems.push(`${label} is the same dish as ${earlier}`);
      } else {
        itemKeys.set(itemKey, label);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`The menu card is invalid:\n  ${problems.join("\n  ")}`);
  }

  return card.map((group) => ({
    name: group.name.trim(),
    items: group.items.map((item) => ({
      name: item.name.trim(),
      price: toAmount(item.price.trim()),
    })),
  }));
}

/** One past the highest sort order, or 0 when there are none. */
function nextOrder(rows: Array<{ sortOrder: number }>): number {
  return rows.reduce((next, row) => Math.max(next, row.sortOrder + 1), 0);
}

/**
 * Add mode. New categories go after the existing ones, and new items after
 * the existing items in their category, so nothing already on the till moves.
 */
function planAdd(card: MenuCardCategory[], current: CurrentMenu): MenuPlan {
  const categoryByKey = new Map(
    current.categories.map((category) => [matchKey(category.name), category]),
  );
  // An item left active in a retired category never reaches the till, so it
  // is not on the menu.
  const onMenu = current.items.filter((item) =>
    current.categories.some((category) => category.id === item.categoryId),
  );
  let nextCategoryOrder = nextOrder(current.categories);

  const categories = card.map((group): CategoryPlan => {
    const existingCategory = categoryByKey.get(matchKey(group.name));
    let nextItemOrder = nextOrder(
      onMenu.filter((item) => item.categoryId === existingCategory?.id),
    );

    const items = group.items.map((item): PlannedItem => {
      const candidates = onMenu.filter(
        (candidate) => matchKey(candidate.name) === matchKey(item.name),
      );
      // A dish already on the menu twice: compare with the copy in this
      // category, if there is one.
      const existing =
        candidates.find(
          (candidate) => candidate.categoryId === existingCategory?.id,
        ) ?? candidates[0];

      if (!existing) {
        return { ...item, action: "add", sortOrder: nextItemOrder++ };
      }
      return {
        ...item,
        action: "skip",
        existing,
        differs:
          compare(existing.price, item.price) !== 0 ||
          existing.categoryId !== existingCategory?.id,
      };
    });

    return {
      // An existing category keeps the name the owner gave it.
      name: existingCategory?.name ?? group.name,
      category: existingCategory
        ? { status: "existing", id: existingCategory.id }
        : items.some((item) => item.action === "add")
          ? { status: "new", sortOrder: nextCategoryOrder++ }
          : { status: "unneeded" },
      items,
    };
  });

  return { categories, retire: { categories: [], items: [] } };
}

/**
 * Replace mode. Categories and items are numbered in card order. A row is
 * kept only when it is already exactly the card's: an item with the same
 * name and price in the category of the same name, and a category holding at
 * least one such item. Everything else active is retired.
 */
function planReplace(card: MenuCardCategory[], current: CurrentMenu): MenuPlan {
  const keptCategories = new Set<string>();
  const keptItems = new Set<string>();

  const categories = card.map((group, position): CategoryPlan => {
    const sameName = current.categories.find(
      (category) => category.name === group.name,
    );

    const items = group.items.map((item, sortOrder): PlannedItem => {
      const existing = current.items.find(
        (candidate) =>
          candidate.categoryId === sameName?.id &&
          candidate.name === item.name &&
          compare(candidate.price, item.price) === 0,
      );
      if (!existing) return { ...item, action: "add", sortOrder };
      keptItems.add(existing.id);
      return { ...item, action: "keep", existing, sortOrder };
    });

    const keep = sameName && items.some((item) => item.action === "keep");
    if (keep) keptCategories.add(sameName.id);

    return {
      name: group.name,
      category: keep
        ? { status: "keep", existing: sameName, sortOrder: position }
        : { status: "new", sortOrder: position },
      items,
    };
  });

  return {
    categories,
    retire: {
      categories: current.categories.filter(
        (category) => !keptCategories.has(category.id),
      ),
      items: current.items.filter((item) => !keptItems.has(item.id)),
    },
  };
}

/** Decides, without writing anything, what the import will do. */
export function planImport(
  card: MenuCardCategory[],
  current: CurrentMenu,
  { replace }: { replace: boolean },
): MenuPlan {
  return replace ? planReplace(card, current) : planAdd(card, current);
}
