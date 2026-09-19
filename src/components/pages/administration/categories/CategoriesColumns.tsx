"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { CategoryTone } from "@/lib/utils/category-tone";
import type { CategoryRow } from "@/types/category.types";

export const CATEGORY_HEADERS = ["Name", "Order", "Items", ""] as const;

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
          <span className="font-semibold">{row.name}</span>
        </span>
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {row.sortOrder}
      </TableCell>
      <TableCell className="tabular-nums">
        {row.itemCount} item{row.itemCount === 1 ? "" : "s"}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Edit ${row.name}`}
          onClick={() => onEdit(row)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Remove ${row.name}`}
          onClick={() => onDelete(row)}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
