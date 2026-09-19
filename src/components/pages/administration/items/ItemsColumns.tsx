"use client";

import { Pencil, Trash2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { thumbnailUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { type CategoryTone, categoryTone } from "@/lib/utils/category-tone";
import { formatINR } from "@/lib/utils/money";
import type { AdminItemRow } from "@/types/item.types";

export const ITEM_HEADERS = [
  "",
  "Name",
  "Category",
  "Price",
  "Available",
  "Order",
  "",
] as const;

export function ItemTableRow({
  row,
  tone = categoryTone(0),
  onEdit,
  onDelete,
  onToggleAvailability,
  disabled,
}: {
  row: AdminItemRow;
  tone?: CategoryTone;
  onEdit: (row: AdminItemRow) => void;
  onDelete: (row: AdminItemRow) => void;
  onToggleAvailability: (row: AdminItemRow) => void;
  disabled: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="w-16">
        <div
          className={cn(
            "relative size-11 overflow-hidden rounded-[11px]",
            tone.tile,
          )}
        >
          {row.imageUrl ? (
            <Image
              src={thumbnailUrl(row.imageUrl, 88)}
              alt=""
              fill
              sizes="44px"
              className="object-cover"
            />
          ) : (
            <div
              className={cn(
                "font-heading flex h-full items-center justify-center text-lg font-bold",
                tone.ink,
              )}
            >
              {row.name.charAt(0)}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="font-semibold">{row.name}</TableCell>
      <TableCell>
        <span
          className={cn(
            "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
            tone.tile,
            tone.ink,
          )}
        >
          {row.categoryName}
        </span>
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        {formatINR(row.price)}
      </TableCell>
      <TableCell>
        <Switch
          checked={row.isAvailable}
          disabled={disabled}
          aria-label={`${row.name} available`}
          onCheckedChange={() => onToggleAvailability(row)}
        />
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {row.sortOrder}
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
