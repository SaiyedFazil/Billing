"use client";

import { Download, Ellipsis } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ActionResult } from "@/lib/utils/result";

import { useCsvExport } from "../hooks/useCsvExport";

/**
 * The phone's stand-in for the Export CSV button: a "More" menu with the same
 * export inside it, shown only below sm. From sm the page header's button is
 * shown instead.
 */
export function ExportCsvMenu({
  filename,
  onExport,
  disabled,
}: {
  filename: string;
  onExport: () => Promise<ActionResult<{ csv: string }>>;
  disabled?: boolean;
}) {
  const csv = useCsvExport({ filename, onExport });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="More"
          disabled={disabled}
          className="shrink-0 sm:hidden"
        >
          <Ellipsis className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={csv.isPending} onSelect={csv.run}>
          <Download />
          {csv.isPending ? "Preparing…" : "Export CSV"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
