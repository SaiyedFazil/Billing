"use client";

import { Button } from "@/components/ui/button";
import type { MenuCategory } from "@/types/item.types";

export function CategoryTabs({
  categories,
  activeCategoryId,
  onChange,
}: {
  categories: MenuCategory[];
  activeCategoryId: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant={activeCategoryId === null ? "default" : "outline"}
        size="sm"
        onClick={() => onChange(null)}
      >
        All
      </Button>
      {categories.map((category) => (
        <Button
          key={category.id}
          type="button"
          variant={activeCategoryId === category.id ? "default" : "outline"}
          size="sm"
          className="shrink-0"
          onClick={() => onChange(category.id)}
        >
          {category.name}
        </Button>
      ))}
    </div>
  );
}
