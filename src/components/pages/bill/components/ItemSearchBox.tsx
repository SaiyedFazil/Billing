"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-6 items-center rounded-md border border-b-2 border-input bg-background px-2 font-mono text-[11px] text-foreground/80">
      {children}
    </kbd>
  );
}

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
      <Search className="pointer-events-none absolute top-1/2 left-4.5 size-5 -translate-y-1/2 text-muted-foreground" />
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
        placeholder="Search the menu"
        className="h-14 rounded-2xl pr-4 pl-12 text-base shadow-card md:pr-64 md:text-base"
        aria-label="Search menu items"
        aria-describedby="menu-search-hint"
      />
      <span id="menu-search-hint" className="sr-only">
        Enter adds the top match. Escape clears the search.
      </span>
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 items-center gap-1.5 text-xs text-muted-foreground md:flex"
      >
        <Kbd>Enter</Kbd>
        adds top match
        <span className="ml-1.5">
          <Kbd>Esc</Kbd>
        </span>
        clears
      </div>
    </div>
  );
}
