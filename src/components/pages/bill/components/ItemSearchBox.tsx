"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";

export function ItemSearchBox({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // A cashier is faster on the keyboard than the touchscreen, so the search
  // box owns focus on load. See spec §8.1.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="relative">
      <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder="Search items…  (Enter adds the top match, Esc clears)"
        className="pl-9"
        aria-label="Search menu items"
      />
    </div>
  );
}
