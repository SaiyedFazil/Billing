"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { downloadTextFile } from "@/lib/utils/download";
import type { ActionResult } from "@/lib/utils/result";

/**
 * Runs a CSV export action and downloads what it returns. Shared by the
 * Export CSV button and the phone's More menu, so both export the same way.
 */
export function useCsvExport({
  filename,
  onExport,
}: {
  filename: string;
  onExport: () => Promise<ActionResult<{ csv: string }>>;
}) {
  const [isPending, startTransition] = useTransition();

  function run() {
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

  return { isPending, run };
}
