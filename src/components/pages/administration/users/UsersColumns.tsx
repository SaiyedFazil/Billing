"use client";

import { KeyRound, UserCheck, UserX } from "lucide-react";

import { RowActionsMenu } from "@/components/custom/RowActionsMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/constants/roles";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils/initials";
import type { UserRow } from "@/types/user.types";

const FOLDED = "max-lg:hidden";

/**
 * Below lg the username, role and bill count fold under the name and the
 * row's actions become one "⋯" menu; the status stays on the right.
 */
export const USER_COLUMNS = [
  { label: "Name" },
  { label: "Username", className: FOLDED },
  { label: "Role", className: FOLDED },
  { label: "Bills", className: FOLDED },
  { label: "Status" },
  { label: "", className: "text-right" },
] as const;

function RoleBadge({ role }: { role: UserRow["role"] }) {
  return (
    <Badge variant={role === "SUPERADMIN" ? "default" : "secondary"}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

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
          <span className="min-w-0 max-lg:whitespace-normal">
            <span className="font-semibold">
              {row.name}
              {isSelf ? (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  (you)
                </span>
              ) : null}
            </span>
            {/* The folded columns: username, role and bill count. */}
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground lg:hidden">
              <span className="font-mono">{row.username}</span>
              <RoleBadge role={row.role} />
              <span className="tabular-nums">
                {row.billCount} bill{row.billCount === 1 ? "" : "s"}
              </span>
            </span>
          </span>
        </span>
      </TableCell>
      <TableCell
        className={cn("font-mono text-[13px] text-foreground/80", FOLDED)}
      >
        {row.username}
      </TableCell>
      <TableCell className={FOLDED}>
        <RoleBadge role={row.role} />
      </TableCell>
      <TableCell className={cn("tabular-nums", FOLDED)}>
        {row.billCount}
      </TableCell>
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
        <RowActionsMenu
          label={`Actions for ${row.name}`}
          className="lg:hidden"
          actions={[
            {
              label: "Reset password",
              icon: KeyRound,
              onSelect: () => onReset(row),
              disabled,
            },
            {
              label: row.isActive ? "Deactivate" : "Reactivate",
              icon: row.isActive ? UserX : UserCheck,
              onSelect: () => onToggle(row),
              disabled: disabled || isSelf,
              disabledReason: isSelf
                ? "You can't deactivate your own account"
                : undefined,
              destructive: row.isActive,
            },
          ]}
        />
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Reset password for ${row.name}`}
          onClick={() => onReset(row)}
          className="max-lg:hidden"
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
          className={cn(
            "max-lg:hidden",
            row.isActive
              ? "text-destructive hover:bg-destructive-soft hover:text-destructive"
              : "text-success hover:bg-success-soft hover:text-success",
          )}
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
