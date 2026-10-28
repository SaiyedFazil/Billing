"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/utils/result";

import { useCsvExport } from "../hooks/useCsvExport";

export function ExportCsvButton({
  filename,
  onExport,
  disabled,
  className,
}: {
  filename: string;
  onExport: () => Promise<ActionResult<{ csv: string }>>;
  disabled?: boolean;
  className?: string;
}) {
  const csv = useCsvExport({ filename, onExport });

  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || csv.isPending}
      onClick={csv.run}
      className={className}
    >
      <Download className="size-4" />
      {csv.isPending ? "Preparing…" : "Export CSV"}
    </Button>
  );
}
