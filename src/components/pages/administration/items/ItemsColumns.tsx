"use client";

import { PackagePlus, Pencil, Trash2 } from "lucide-react";
import Image from "next/image";

import { RowActionsMenu } from "@/components/custom/RowActionsMenu";
import { StockBadge } from "@/components/custom/StockBadge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { thumbnailUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { type CategoryTone, categoryTone } from "@/lib/utils/category-tone";
import { formatINR } from "@/lib/utils/money";
import type { AdminItemRow } from "@/types/item.types";

/** A column folded under the name below lg. */
const FOLD_LG = "max-lg:hidden";
/** A column folded under the name on a phone. */
const FOLD_SM = "max-sm:hidden";

/**
 * Below lg the category, price and order fold under the name and the row's
 * actions become one "⋯" menu; on a phone the thumbnail goes and the stock
 * badge folds too, leaving name, Available and the menu.
 */
export const ITEM_COLUMNS = [
  { label: "", className: FOLD_SM },
  { label: "Name" },
  { label: "Category", className: FOLD_LG },
  { label: "Price", className: FOLD_LG },
  { label: "Stock", className: FOLD_SM },
  { label: "Available" },
  { label: "Order", className: FOLD_LG },
  { label: "", className: "text-right" },
] as const;

const UNTRACKED_REASON = "Turn on stock tracking in Edit";

function CategoryPill({ name, tone }: { name: string; tone: CategoryTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold",
        tone.tile,
        tone.ink,
      )}
    >
      {name}
    </span>
  );
}

export function ItemTableRow({
  row,
  tone = categoryTone(0),
  onEdit,
  onDelete,
  onToggleAvailability,
  onUpdateStock,
  disabled,
}: {
  row: AdminItemRow;
  tone?: CategoryTone;
  onEdit: (row: AdminItemRow) => void;
  onDelete: (row: AdminItemRow) => void;
  onToggleAvailability: (row: AdminItemRow) => void;
  onUpdateStock: (row: AdminItemRow) => void;
  disabled: boolean;
}) {
  return (
    <TableRow>
      <TableCell className={cn("w-16", FOLD_SM)}>
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
                "flex h-full items-center justify-center font-heading text-lg font-bold",
                tone.ink,
              )}
            >
              {row.name.charAt(0)}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="font-semibold max-lg:whitespace-normal">
        {row.name}
        {/* The folded columns: category, price and order, and on a phone
            the stock badge. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs font-normal text-muted-foreground lg:hidden">
          <CategoryPill name={row.categoryName} tone={tone} />
          <span className="font-semibold text-foreground tabular-nums">
            {formatINR(row.price)}
          </span>
          <span className="tabular-nums">Order {row.sortOrder}</span>
          <span className="sm:hidden">
            <StockBadge level={row} />
          </span>
        </div>
      </TableCell>
      <TableCell className={FOLD_LG}>
        <CategoryPill name={row.categoryName} tone={tone} />
      </TableCell>
      <TableCell className={cn("font-semibold tabular-nums", FOLD_LG)}>
        {formatINR(row.price)}
      </TableCell>
      <TableCell className={FOLD_SM}>
        <StockBadge level={row} />
      </TableCell>
      <TableCell>
        <Switch
          checked={row.isAvailable}
          disabled={disabled}
          aria-label={`${row.name} available`}
          onCheckedChange={() => onToggleAvailability(row)}
        />
      </TableCell>
      <TableCell className={cn("text-muted-foreground tabular-nums", FOLD_LG)}>
        {row.sortOrder}
      </TableCell>
      <TableCell className="text-right whitespace-nowrap">
        <RowActionsMenu
          label={`Actions for ${row.name}`}
          className="lg:hidden"
          actions={[
            {
              label: "Update stock",
              icon: PackagePlus,
              onSelect: () => onUpdateStock(row),
              disabled: disabled || !row.trackStock,
              disabledReason: row.trackStock ? undefined : UNTRACKED_REASON,
            },
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
        {/* The title sits on a wrapper: a disabled button gets no hover. */}
        <span
          className="inline-flex max-lg:hidden"
          title={
            row.trackStock ? `Update stock for ${row.name}` : UNTRACKED_REASON
          }
        >
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || !row.trackStock}
            aria-label={`Update stock for ${row.name}`}
            onClick={() => onUpdateStock(row)}
          >
            <PackagePlus className="size-4" />
          </Button>
        </span>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Edit ${row.name}`}
          onClick={() => onEdit(row)}
          className="max-lg:hidden"
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Remove ${row.name}`}
          onClick={() => onDelete(row)}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive max-lg:hidden"
        >
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
