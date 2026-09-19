"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
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
}: {
  categories: MenuCategory[];
  activeCategoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchEnter: () => void;
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <ItemSearchBox
        value={search}
        onChange={onSearchChange}
        onEnter={onSearchEnter}
      />
      <CategoryTabs
        categories={categories}
        activeCategoryId={activeCategoryId}
        onChange={onCategoryChange}
      />

      <ScrollArea className="min-h-0 flex-1">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            {search.trim()
              ? `No items match “${search.trim()}”.`
              : "No items in this category."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <MenuItemCard key={item.id} item={item} onSelect={onSelect} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
