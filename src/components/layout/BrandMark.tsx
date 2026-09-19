import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

/** The tomato flame tile — the app's mark in the sidebar and on sign-in. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-brand flex size-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_8px_18px_-8px_rgb(242_84_45/0.8)]",
        className,
      )}
    >
      <Flame className="size-[55%]" strokeWidth={2.25} />
    </span>
  );
}
