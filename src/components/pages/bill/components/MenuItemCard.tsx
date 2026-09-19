"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import type { MenuItem } from "@/types/item.types";

export function MenuItemCard({
  item,
  onSelect,
}: {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
}) {
  const soldOut = !item.isAvailable;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onSelect(item)}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border text-left transition",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        soldOut
          ? "cursor-not-allowed opacity-40"
          : "hover:border-primary cursor-pointer hover:shadow-sm active:scale-[0.98]",
      )}
    >
      <div className="bg-muted relative aspect-square w-full">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1280px) 22vw, 160px"
            className="object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-2xl font-semibold">
            {item.name.charAt(0)}
          </div>
        )}
        {soldOut ? (
          <span className="bg-destructive text-destructive-foreground absolute inset-x-0 bottom-0 px-2 py-0.5 text-center text-[10px] font-semibold uppercase">
            Sold out
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5 p-2">
        <p className="line-clamp-2 text-sm leading-tight font-medium">
          {item.name}
        </p>
        <p className="text-muted-foreground text-sm">
          {formatINR(item.price)}
        </p>
      </div>
    </button>
  );
}
