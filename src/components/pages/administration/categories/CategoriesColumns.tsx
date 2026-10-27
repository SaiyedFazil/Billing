"use client";

import { Pencil, Trash2 } from "lucide-react";

import { RowActionsMenu } from "@/components/custom/RowActionsMenu";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CategoryTone } from "@/lib/utils/category-tone";
import type { CategoryRow } from "@/types/category.types";

/**
 * On a phone the order and item count fold under the name and Edit and
 * Remove become one "⋯" menu.
 */
export const CATEGORY_COLUMNS = [
  { label: "Name" },
  { label: "Order", className: "max-sm:hidden" },
  { label: "Items", className: "max-sm:hidden" },
  { label: "", className: "text-right" },
] as const;

export function CategoryTableRow({
  row,
  tone,
  onEdit,
  onDelete,
  disabled,
}: {
  row: CategoryRow;
  tone: CategoryTone;
  onEdit: (row: CategoryRow) => void;
  onDelete: (row: CategoryRow) => void;
  disabled: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(
              "flex size-9 items-center justify-center rounded-[10px] font-heading text-base font-bold",
              tone.tile,
              tone.ink,
            )}
          >
            {row.name.charAt(0)}
          </span>
          <span className="min-w-0 max-sm:whitespace-normal">
            <span className="font-semibold">{row.name}</span>
            {/* The folded columns. */}
            <span className="block text-xs text-muted-foreground tabular-nums sm:hidden">
              Order {row.sortOrder} · {row.itemCount} item
              {row.itemCount === 1 ? "" : "s"}
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums max-sm:hidden">
        {row.sortOrder}
      </TableCell>
      <TableCell className="tabular-nums max-sm:hidden">
        {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
      </TableCell>
      <TableCell className="text-right">
        <RowActionsMenu
          label={`Actions for ${row.name}`}
          className="sm:hidden"
          actions={[
            {
              label: "Edit",
              icon: Pencil,
              onSelect: () => onEdit(row),
              disabled,
            },
            {
              label: "Remove",
              icon: Trash2,
              onSelect: () => onDelete(row),
              disabled,
              destructive: true,
            },
          ]}
        />
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Edit ${row.name}`}
          onClick={() => onEdit(row)}
          className="max-sm:hidden"
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Remove ${row.name}`}
          onClick={() => onDelete(row)}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive max-sm:hidden"
        >
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
