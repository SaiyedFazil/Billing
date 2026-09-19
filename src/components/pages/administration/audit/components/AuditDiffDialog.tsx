"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";
import type { AuditLogEntry } from "@/types/audit.types";

function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <p className="text-muted-foreground text-xs font-medium uppercase">
        {label}
      </p>
      <pre className="bg-muted max-h-64 overflow-auto rounded-md p-3 text-xs">
        {value === null || value === undefined
          ? "—"
          : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditDiffDialog({
  entry,
  onOpenChange,
}: {
  entry: AuditLogEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry
              ? (AUDIT_ACTION_LABELS[entry.action as AuditAction] ?? entry.action)
              : ""}
          </DialogTitle>
          <DialogDescription>
            {entry?.actorName ?? "System"} ·{" "}
            {entry?.createdAt.toLocaleString("en-GB")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Snapshot label="Before" value={entry?.before} />
          <Snapshot label="After" value={entry?.after} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
