import { CalendarDays, Wallet } from "lucide-react";

import { TabsList, TabsTrigger } from "@/components/ui/tabs";

const VIEWS = [
  { value: "expenses", label: "Expenses", icon: Wallet },
  { value: "days", label: "Day by day", icon: CalendarDays },
] as const;

/**
 * The page-level switch under the header. Each view is a whole table of its
 * own; the date range and the totals above it are shared. On a phone the two
 * share the row in equal halves.
 */
export function CashBookViewTabs() {
  return (
    <TabsList
      variant="line"
      className="w-full justify-start gap-6 border-b p-0 group-data-horizontal/tabs:h-auto max-sm:gap-0"
    >
      {VIEWS.map(({ value, label, icon: Icon }) => (
        // Radix focuses a tab from script on mouse down, which Chrome then
        // rings as keyboard focus: a soft glow reads as focus, not an error.
        <TabsTrigger
          key={value}
          value={value}
          className="h-11 flex-none px-1 text-[15px] font-semibold text-muted-foreground after:bg-primary group-data-horizontal/tabs:after:-bottom-px focus-visible:border-transparent focus-visible:ring-ring/30 focus-visible:outline-0 max-sm:flex-1 data-active:text-foreground [&_svg:not([class*='size-'])]:size-4.5"
        >
          <Icon />
          {label}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}
