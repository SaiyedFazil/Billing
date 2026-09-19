"use client";

import { KeyRound, UserCheck, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/constants/roles";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils/initials";
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
      <TableCell>
        <span className="flex items-center gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              row.role === "SUPERADMIN"
                ? "bg-sidebar text-[#ffb79e]"
                : "bg-muted text-foreground/80",
            )}
          >
            {initials(row.name)}
          </span>
          <span className="font-semibold">
            {row.name}
            {isSelf ? (
              <span className="text-muted-foreground ml-2 text-xs font-normal">
                (you)
              </span>
            ) : null}
          </span>
        </span>
      </TableCell>
      <TableCell className="text-foreground/80 font-mono text-[13px]">
        {row.username}
      </TableCell>
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
          <Badge variant="warning" dot>
            Locked
          </Badge>
        ) : (
          <Badge variant="success" dot>
            Active
          </Badge>
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
          className={
            row.isActive
              ? "text-destructive hover:bg-destructive-soft hover:text-destructive"
              : "text-success hover:bg-success-soft hover:text-success"
          }
        >
          {row.isActive ? (
            <UserX className="size-4" />
          ) : (
            <UserCheck className="size-4" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}
