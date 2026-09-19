import type { MenuCategory, MenuItem } from "@/types/item.types";

/** Items visible in the grid for the current tab and search term. */
export function filterItems(
  categories: MenuCategory[],
  activeCategoryId: string | null,
  search: string,
): MenuItem[] {
  const scoped =
    activeCategoryId === null
      ? categories.flatMap((category) => category.items)
      : (categories.find((c) => c.id === activeCategoryId)?.items ?? []);

  const term = search.trim().toLowerCase();
  if (!term) return scoped;

  return scoped.filter((item) => item.name.toLowerCase().includes(term));
}

/**
 * The item a bare Enter in the search box should add.
 *
 * Searches the WHOLE menu rather than the active category, so the cashier does
 * not have to think about tabs while typing. Prefix matches win over substring
 * matches, and sold-out items are never auto-added.
 */
export function topSearchMatch(
  categories: MenuCategory[],
  search: string,
): MenuItem | null {
  const term = search.trim().toLowerCase();
  if (!term) return null;

  const all = categories.flatMap((category) => category.items);

  const startsWith = all.find(
    (item) => item.isAvailable && item.name.toLowerCase().startsWith(term),
  );
  if (startsWith) return startsWith;

  return (
    all.find(
      (item) => item.isAvailable && item.name.toLowerCase().includes(term),
    ) ?? null
  );
}
