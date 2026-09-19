"use client";

import { KeyRound, UserCheck, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/constants/roles";
import type { UserRow } from "@/types/user.types";

export const USER_HEADERS = [
  "Name",
  "Username",
  "Role",
  "Bills",
  "Status",
  "",
] as const;

export function UserTableRow({
  row,
  currentUserId,
  onReset,
  onToggle,
  disabled,
}: {
  row: UserRow;
  currentUserId: string;
  onReset: (row: UserRow) => void;
  onToggle: (row: UserRow) => void;
  disabled: boolean;
}) {
  const isSelf = row.id === currentUserId;
  const isLocked = row.lockedUntil !== null && row.lockedUntil > new Date();

  return (
    <TableRow className={row.isActive ? "" : "opacity-60"}>
      <TableCell className="font-medium">
        {row.name}
        {isSelf ? (
          <span className="text-muted-foreground ml-2 text-xs">(you)</span>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-sm">{row.username}</TableCell>
      <TableCell>
        <Badge variant={row.role === "SUPERADMIN" ? "default" : "secondary"}>
          {ROLE_LABELS[row.role]}
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{row.billCount}</TableCell>
      <TableCell>
        {!row.isActive ? (
          <Badge variant="outline">Deactivated</Badge>
        ) : isLocked ? (
          <Badge variant="destructive">Locked</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Reset password for ${row.name}`}
          onClick={() => onReset(row)}
        >
          <KeyRound className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || isSelf}
          aria-label={
            row.isActive ? `Deactivate ${row.name}` : `Reactivate ${row.name}`
          }
          onClick={() => onToggle(row)}
        >
          {row.isActive ? (
            <UserX className="text-destructive size-4" />
          ) : (
            <UserCheck className="size-4" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}
