import { Flame, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

const TONES = {
  hero: {
    card: "bg-sidebar border-transparent text-white shadow-hero",
    label: "text-[#d6cdc4]",
    icon: "bg-brand/20 text-[#ff8a65]",
    hint: "text-[#b5aba1]",
  },
  brand: {
    card: "bg-card shadow-card",
    label: "text-muted-foreground",
    icon: "bg-brand-soft text-primary",
    hint: "text-muted-foreground",
  },
  mustard: {
    card: "bg-card shadow-card",
    label: "text-muted-foreground",
    icon: "bg-warning-soft text-warning-ink",
    hint: "text-muted-foreground",
  },
  basil: {
    card: "bg-card shadow-card",
    label: "text-muted-foreground",
    icon: "bg-success-soft text-success-ink",
    hint: "text-muted-foreground",
  },
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  compact = false,
}: {
  label: string;
  value: string;
  /** A line of text, or a small breakdown such as the Cash book's cash/online split. */
  hint?: React.ReactNode;
  icon: LucideIcon;
  /** "hero" is the dark card that leads a row — use it once per row. */
  tone: keyof typeof TONES;
  /** Smaller value type, for text values such as an item name. */
  compact?: boolean;
}) {
  const style = TONES[tone];

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3.5 overflow-hidden rounded-[20px] border p-5.5",
        style.card,
      )}
    >
      {tone === "hero" ? (
        <Flame
          aria-hidden
          strokeWidth={1.5}
          className="absolute -right-5 -bottom-7 size-32 text-brand/15"
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className={cn("text-sm font-medium", style.label)}>{label}</span>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-[10px]",
            style.icon,
          )}
        >
          <Icon className="size-4.5" />
        </span>
      </div>

      {/* Below lg the card can be narrow, so the value scales with it rather
          than being cut off; a desktop card keeps its fixed size. */}
      <div className="relative space-y-1 max-lg:@container">
        <p
          className={cn(
            "truncate font-heading leading-tight font-extrabold tracking-tight tabular-nums max-lg:wrap-anywhere max-lg:whitespace-normal",
            compact
              ? "text-[26px] max-lg:line-clamp-2"
              : "text-[34px] max-lg:text-[clamp(1.125rem,14cqi,2.125rem)]",
          )}
        >
          {value}
        </p>
        {hint ? (
          <div className={cn("text-[13px]", style.hint)}>{hint}</div>
        ) : null}
      </div>
    </div>
  );
}
