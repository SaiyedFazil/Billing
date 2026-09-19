"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { CategoryRow } from "@/types/category.types";

export const CATEGORY_HEADERS = ["Name", "Order", "Items", ""] as const;

export function CategoryTableRow({
  row,
  onEdit,
  onDelete,
  disabled,
}: {
  row: CategoryRow;
  onEdit: (row: CategoryRow) => void;
  onDelete: (row: CategoryRow) => void;
  disabled: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="tabular-nums">{row.sortOrder}</TableCell>
      <TableCell className="tabular-nums">{row.itemCount}</TableCell>
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
        >
          <Trash2 className="text-destructive size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
