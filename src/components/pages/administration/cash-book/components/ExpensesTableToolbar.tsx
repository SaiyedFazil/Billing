import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExpenseCategoryRow } from "@/types/expense.types";

/** Narrows the list only — the KPI cards always show the whole range. */
export function ExpensesTableToolbar({
  group,
  categoryId,
  categories,
  disabled,
  onGroupChange,
  onCategoryChange,
}: {
  group: string;
  categoryId: string;
  categories: ExpenseCategoryRow[];
  disabled: boolean;
  onGroupChange: (group: string) => void;
  onCategoryChange: (categoryId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select
        value={group || "ALL"}
        disabled={disabled}
        onValueChange={onGroupChange}
      >
        <SelectTrigger className="w-36" aria-label="Filter by how it was paid">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All payments</SelectItem>
          <SelectItem value="cash">Cash</SelectItem>
          <SelectItem value="online">Online</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={categoryId || "ALL"}
        disabled={disabled}
        onValueChange={onCategoryChange}
      >
        <SelectTrigger className="w-48" aria-label="Filter by category">
          <SelectValue />
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
    </div>
  );
}
