"use client";

import { SearchX } from "lucide-react";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { CategoryTone } from "@/lib/utils/category-tone";
import type { MenuCategory, MenuItem } from "@/types/item.types";

import { CategoryTabs } from "./CategoryTabs";
import { ItemSearchBox } from "./ItemSearchBox";
import { MenuItemCard } from "./MenuItemCard";

export function MenuGrid({
  categories,
  activeCategoryId,
  onCategoryChange,
  search,
  onSearchChange,
  onSearchEnter,
  items,
  onSelect,
  quantityByItemId,
  toneByCategoryId,
}: {
  categories: MenuCategory[];
  activeCategoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchEnter: () => void;
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  quantityByItemId: Map<string, number>;
  toneByCategoryId: Map<string, CategoryTone>;
}) {
  return (
    <section aria-label="Menu" className="flex min-h-0 min-w-0 flex-col gap-4">
      {/* On a phone, search and the category chips stay under the top bar
          while the menu scrolls. From md the wrapper dissolves, so the two
          sit in the section exactly as before. */}
      <div className="flex flex-col gap-4 max-md:sticky max-md:top-14 max-md:z-30 max-md:bg-background max-md:py-2 md:contents">
        <ItemSearchBox
          value={search}
          onChange={onSearchChange}
          onEnter={onSearchEnter}
        />
        <CategoryTabs
          categories={categories}
          activeCategoryId={activeCategoryId}
          onChange={onCategoryChange}
          toneByCategoryId={toneByCategoryId}
        />
      </div>

      {/* The negative margins and matching padding give card rings, the hover
          lift and the scrollbar room inside the viewport without shifting the
          grid out of line with the search box. */}
      <ScrollArea className="-mx-1 -mt-1 min-h-0 flex-1 md:-mr-3">
        {items.length === 0 ? (
          <TableEmptyState
            icon={SearchX}
            title={
              search.trim()
                ? `No items match “${search.trim()}”`
                : "No items in this category"
            }
            description={
              search.trim() ? "Press Esc to clear the search." : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 p-1 pb-4 sm:grid-cols-3 sm:gap-4 md:grid-cols-2 md:pr-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {items.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onSelect={onSelect}
                quantity={quantityByItemId.get(item.id) ?? 0}
                tone={toneByCategoryId.get(item.categoryId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </section>
  );
}
