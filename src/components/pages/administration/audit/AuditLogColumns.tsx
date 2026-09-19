"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";
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

  return (
    <TableRow>
      <TableCell className="text-sm whitespace-nowrap">
        {row.createdAt.toLocaleString("en-GB")}
      </TableCell>
      <TableCell>{row.actorName ?? "—"}</TableCell>
      <TableCell>
        <Badge
          variant={
            DESTRUCTIVE_ACTIONS.has(row.action) ? "destructive" : "secondary"
          }
        >
          {label}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
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
