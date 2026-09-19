"use client";

import { Plus } from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { type CategoryTone, categoryTone } from "@/lib/utils/category-tone";
import { formatINR } from "@/lib/utils/money";
import type { MenuItem } from "@/types/item.types";

export function MenuItemCard({
  item,
  onSelect,
  quantity,
  tone = categoryTone(0),
}: {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  /** How many are already on the bill; 0 when none. */
  quantity: number;
  tone?: CategoryTone;
}) {
  const soldOut = !item.isAvailable;
  const inCart = quantity > 0;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onSelect(item)}
      className={cn(
        "group bg-card relative flex flex-col rounded-[18px] border p-2 text-left transition-all duration-150",
        "focus-visible:border-brand focus-visible:ring-brand/25 focus-visible:ring-4 focus-visible:outline-none",
        soldOut
          ? "cursor-not-allowed opacity-60"
          : inCart
            ? "border-brand ring-brand cursor-pointer shadow-[0_10px_24px_-16px_rgb(209_67_27/0.7)] ring-1 active:scale-[0.98]"
            : "shadow-card hover:border-brand/40 hover:shadow-lift cursor-pointer hover:-translate-y-0.5 active:scale-[0.98]",
      )}
    >
      <span
        className={cn(
          "relative block aspect-4/3 w-full overflow-hidden rounded-xl",
          soldOut ? "bg-muted" : tone.tile,
        )}
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1280px) 25vw, 220px"
            className={cn("object-cover", soldOut && "grayscale")}
          />
        ) : (
          <span
            aria-hidden
            className={cn(
              "font-heading flex h-full items-center justify-center text-5xl font-bold",
              soldOut ? "text-muted-foreground/60" : tone.ink,
            )}
          >
            {item.name.charAt(0)}
          </span>
        )}

        {soldOut ? (
          <span className="bg-foreground text-background absolute bottom-2 left-2 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wider uppercase">
            Sold out
          </span>
        ) : null}

        {inCart ? (
          <span className="bg-primary absolute top-2 right-2 flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[13px] font-bold text-white shadow-[0_4px_10px_-4px_rgb(209_67_27/0.7)]">
            ×{quantity}
            <span className="sr-only"> on the bill</span>
          </span>
        ) : null}
      </span>

      <span className="flex items-end justify-between gap-2 px-1.5 pt-3 pb-1">
        <span className="min-w-0 space-y-0.5">
          <span className="line-clamp-2 block text-[15px] leading-tight font-semibold">
            {item.name}
          </span>
          <span
            className={cn(
              "font-heading block text-lg font-bold tabular-nums",
              soldOut && "text-muted-foreground",
            )}
          >
            {formatINR(item.price)}
          </span>
        </span>
        {soldOut ? null : (
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full transition-colors",
              inCart
                ? "bg-primary text-white"
                : "bg-brand-soft text-primary group-hover:bg-primary group-hover:text-white",
            )}
          >
            <Plus className="size-4" strokeWidth={2.5} />
          </span>
        )}
      </span>
    </button>
  );
}
