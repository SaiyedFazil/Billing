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
      toast.success("Three files downloaded");
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="bg-warning-soft text-warning-ink flex size-12 shrink-0 items-center justify-center rounded-2xl">
          <DatabaseBackup className="size-5" />
        </span>
        <div className="flex-1 space-y-1">
          <h2 className="font-heading text-lg font-bold">Export all data</h2>
          <p className="text-muted-foreground max-w-2xl text-sm">
            Downloads every bill, every sold line and the current menu as three
            CSV files. <strong className="text-foreground">Do this once a month</strong>{" "}
            and keep the files somewhere other than this computer — the free
            database plan keeps only a short restore window.
          </p>
        </div>
        <Button variant="outline" disabled={isPending} onClick={handleExport}>
          <Download className="size-4" />
          {isPending ? "Preparing…" : "Export all data"}
        </Button>
      </CardContent>
    </Card>
  );
}
