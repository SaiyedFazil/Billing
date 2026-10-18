"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StockFilter } from "@/lib/utils/stock";

const STOCK_OPTIONS: Array<{ value: StockFilter; label: string }> = [
  { value: "ALL", label: "All stock" },
  { value: "IN_STOCK", label: "In stock" },
  { value: "LOW", label: "Low stock" },
  { value: "OUT", label: "Out of stock" },
  { value: "UNTRACKED", label: "Not tracked" },
];

export function ItemsTableToolbar({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
  stockFilter,
  onStockFilterChange,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categories: Array<{ id: string; name: string }>;
  stockFilter: StockFilter;
  onStockFilterChange: (value: StockFilter) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-56 flex-1 sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search items"
          className="h-11 pl-10 shadow-card"
          aria-label="Search items"
        />
      </div>

      <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
        <SelectTrigger className="w-52 shadow-card data-[size=default]:h-11">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={stockFilter}
        onValueChange={(value) => onStockFilterChange(value as StockFilter)}
      >
        <SelectTrigger
          className="w-44 shadow-card data-[size=default]:h-11"
          aria-label="Filter by stock"
        >
          <SelectValue placeholder="All stock" />
        </SelectTrigger>
        <SelectContent>
          {STOCK_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
