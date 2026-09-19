"use client";

import { Pencil, Trash2 } from "lucide-react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { thumbnailUrl } from "@/lib/storage";
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
  onEdit,
  onDelete,
  onToggleAvailability,
  disabled,
}: {
  row: AdminItemRow;
  onEdit: (row: AdminItemRow) => void;
  onDelete: (row: AdminItemRow) => void;
  onToggleAvailability: (row: AdminItemRow) => void;
  disabled: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="bg-muted relative size-10 overflow-hidden rounded">
          {row.imageUrl ? (
            <Image
              src={thumbnailUrl(row.imageUrl, 80)}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <div className="text-muted-foreground flex h-full items-center justify-center text-sm font-semibold">
              {row.name.charAt(0)}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        <Badge variant="secondary">{row.categoryName}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{formatINR(row.price)}</TableCell>
      <TableCell>
        <Switch
          checked={row.isAvailable}
          disabled={disabled}
          aria-label={`${row.name} available`}
          onCheckedChange={() => onToggleAvailability(row)}
        />
      </TableCell>
      <TableCell className="tabular-nums">{row.sortOrder}</TableCell>
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
