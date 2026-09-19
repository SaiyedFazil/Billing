"use client";

import { cn } from "@/lib/utils";
import type { CategoryTone } from "@/lib/utils/category-tone";
import type { MenuCategory } from "@/types/item.types";

function CategoryChip({
  label,
  count,
  dot,
  active,
  onClick,
}: {
  label: string;
  count: number;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border pr-2.5 pl-4 text-sm font-semibold transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input bg-card text-foreground/80 hover:border-foreground/30",
      )}
    >
      {dot ? <span aria-hidden className={cn("size-2 rounded-full", dot)} /> : null}
      {label}
      <span
        className={cn(
          "flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs",
          active ? "bg-white/15" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function CategoryTabs({
  categories,
  activeCategoryId,
  onChange,
  toneByCategoryId,
}: {
  categories: MenuCategory[];
  activeCategoryId: string | null;
  onChange: (id: string | null) => void;
  toneByCategoryId: Map<string, CategoryTone>;
}) {
  const total = categories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none [&::-webkit-scrollbar]:hidden">
      <CategoryChip
        label="All"
        count={total}
        active={activeCategoryId === null}
        onClick={() => onChange(null)}
      />
      {categories.map((category) => (
        <CategoryChip
          key={category.id}
          label={category.name}
          count={category.items.length}
          dot={toneByCategoryId.get(category.id)?.dot}
          active={activeCategoryId === category.id}
          onClick={() => onChange(category.id)}
        />
      ))}
    </div>
  );
}
