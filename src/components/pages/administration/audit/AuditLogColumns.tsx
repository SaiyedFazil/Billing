"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";
import { initials } from "@/lib/utils/initials";
import type { AuditLogEntry } from "@/types/audit.types";

export const AUDIT_HEADERS = ["When", "Who", "What", "Entity", ""] as const;

const DESTRUCTIVE_ACTIONS = new Set([
  "ITEM_DELETED",
  "CATEGORY_DELETED",
  "USER_DEACTIVATED",
  "BILL_VOIDED",
  "LOGIN_LOCKED",
]);

export function AuditTableRow({
  row,
  onInspect,
}: {
  row: AuditLogEntry;
  onInspect: (row: AuditLogEntry) => void;
}) {
  const label = AUDIT_ACTION_LABELS[row.action as AuditAction] ?? row.action;
  const destructive = DESTRUCTIVE_ACTIONS.has(row.action);

  return (
    <TableRow>
      <TableCell className="text-[13px] whitespace-nowrap text-foreground/80 tabular-nums">
        {row.createdAt.toLocaleString("en-GB")}
      </TableCell>
      <TableCell>
        {row.actorName ? (
          <span className="flex items-center gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground/80">
              {initials(row.actorName)}
            </span>
            {row.actorName}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={destructive ? "destructive" : "secondary"}
          dot={destructive}
        >
          {label}
        </Badge>
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {row.entityType}
      </TableCell>
      <TableCell className="text-right">
        {row.before || row.after ? (
          <Button variant="ghost" size="sm" onClick={() => onInspect(row)}>
            Details
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
