import type { ZodType } from "zod";

import { compare, toAmount } from "../../src/lib/utils/money";
import { categorySchema } from "../../src/lib/validation/category-schema";
import { itemSchema } from "../../src/lib/validation/item-schema";

/**
 * The pure half of `npm run db:import-menu`: checking a menu card and deciding
 * what to do with each line of it. No database access, so
 * `npm run verify:menu-import` can prove the duplicate rules offline.
 *
 * An item counts as already on the menu when an ACTIVE item in any category
 * has the same name, ignoring case, spacing and punctuation. Matching across
 * categories is deliberate: the same dish under two tabs is a duplicate to the
 * cashier, even though the database would allow it. When that item's price or
 * category differs from the card it is reported, never changed — re-pricing
 * is the owner's call, made in Administration > Items, where it is audited.
 */

export type MenuCardCategory = {
  name: string;
  items: Array<{ name: string; price: string }>;
};

/** The active menu as the database holds it now. */
export type CurrentMenu = {
  categories: Array<{ id: string; name: string; sortOrder: number }>;
  items: Array<{
    name: string;
    price: string;
    categoryId: string;
    categoryName: string;
    sortOrder: number;
  }>;
};

export type PlannedItem = { name: string; price: string } & (
  | { action: "add"; sortOrder: number }
  | {
      action: "skip";
      existing: { name: string; price: string; categoryName: string };
      /** Same dish, but its price or category is not what the card says. */
      differs: boolean;
    }
);

export type CategoryPlan = {
  name: string;
  category:
    | { status: "existing"; id: string }
    | { status: "new"; sortOrder: number }
    // Every item under it is already on the menu elsewhere, so creating it
    // would only add an empty tab to the till.
    | { status: "unneeded" };
  items: PlannedItem[];
};

/**
 * What two names must share to be the same dish: their letters and digits.
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

/**
 * Decides what happens to each line of a validated card. New categories go
 * after the existing ones, and new items after the existing items in their
 * category, in card order — so nothing already on the till moves.
 */
export function planImport(
  card: MenuCardCategory[],
  current: CurrentMenu,
): CategoryPlan[] {
  const categoryByKey = new Map(
    current.categories.map((category) => [matchKey(category.name), category]),
  );
  const itemByKey = new Map(
    current.items.map((item) => [matchKey(item.name), item]),
  );

  let nextCategoryOrder = current.categories.reduce(
    (next, category) => Math.max(next, category.sortOrder + 1),
    0,
  );

  return card.map((group) => {
    const existingCategory = categoryByKey.get(matchKey(group.name));

    let nextItemOrder = current.items
      .filter((item) => item.categoryId === existingCategory?.id)
      .reduce((next, item) => Math.max(next, item.sortOrder + 1), 0);

    const planned = group.items.map((item): PlannedItem => {
      const existing = itemByKey.get(matchKey(item.name));
      if (!existing) {
        return { ...item, action: "add", sortOrder: nextItemOrder++ };
      }
      return {
        ...item,
        action: "skip",
        existing,
        differs:
          compare(existing.price, item.price) !== 0 ||
          matchKey(existing.categoryName) !== matchKey(group.name),
      };
    });

    const hasItemsToAdd = planned.some((item) => item.action === "add");

    return {
      // An existing category keeps the name the owner gave it.
      name: existingCategory?.name ?? group.name,
      category: existingCategory
        ? { status: "existing", id: existingCategory.id }
        : hasItemsToAdd
          ? { status: "new", sortOrder: nextCategoryOrder++ }
          : { status: "unneeded" },
      items: planned,
    };
  });
}
