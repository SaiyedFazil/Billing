"use client";

import { DatabaseBackup, Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { downloadTextFile } from "@/lib/utils/download";
import { exportAllDataAction } from "@/server/reports/export-all-action";

export function ExportAllCard() {
  const [isPending, startTransition] = useTransition();

  function handleExport() {
    startTransition(async () => {
      const result = await exportAllDataAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      downloadTextFile(`bills-${stamp}.csv`, result.data.bills);
      downloadTextFile(`bill-items-${stamp}.csv`, result.data.billItems);
      downloadTextFile(`items-${stamp}.csv`, result.data.items);
      downloadTextFile(
        `stock-movements-${stamp}.csv`,
        result.data.stockMovements,
      );
      toast.success("Four files downloaded");
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning-ink">
            <DatabaseBackup className="size-5" />
          </span>
          <div className="min-w-0 space-y-1">
            <h2 className="font-heading text-lg leading-snug font-bold">
              Export all data
            </h2>
            <p className="text-sm text-pretty text-muted-foreground">
              Downloads every bill, every sold line, the current menu with its
              stock, and the stock history as four CSV files.{" "}
              <strong className="text-foreground">Do this once a month</strong>{" "}
              and keep the files somewhere other than this computer — the free
              database plan keeps only a short restore window.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="w-full"
          disabled={isPending}
          onClick={handleExport}
        >
          <Download className="size-4" />
          {isPending ? "Preparing…" : "Export all data"}
        </Button>
      </CardContent>
    </Card>
  );
}
