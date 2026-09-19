"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { downloadTextFile } from "@/lib/utils/download";
import type { ActionResult } from "@/lib/utils/result";

export function ExportCsvButton({
  filename,
  onExport,
  disabled,
}: {
  filename: string;
  onExport: () => Promise<ActionResult<{ csv: string }>>;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await onExport();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      downloadTextFile(filename, result.data.csv);
      toast.success("Export downloaded");
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || isPending}
      onClick={handleClick}
    >
      <Download className="size-4" />
      {isPending ? "Preparing…" : "Export CSV"}
    </Button>
  );
}
