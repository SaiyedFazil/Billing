"use client";

import { Ellipsis, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type RowAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Shown under the label when disabled; desktop shows it as a title. */
  disabledReason?: string;
  destructive?: boolean;
};

/**
 * A table row's actions as one "⋯" menu, for where a row of icon buttons
 * will not fit. The caller hides it at the table's fold width (for example
 * `lg:hidden`) and hides its icon buttons below that width.
 */
export function RowActionsMenu({
  label,
  actions,
  className,
}: {
  /** The trigger's aria-label, e.g. "Actions for Veg Burger". */
  label: string;
  actions: RowAction[];
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          className={className}
        >
          <Ellipsis className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.label}
              disabled={action.disabled}
              variant={action.destructive ? "destructive" : "default"}
              onSelect={action.onSelect}
            >
              <Icon />
              <span className="flex flex-col">
                {action.label}
                {action.disabled && action.disabledReason ? (
                  <span className="text-xs text-muted-foreground">
                    {action.disabledReason}
                  </span>
                ) : null}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
