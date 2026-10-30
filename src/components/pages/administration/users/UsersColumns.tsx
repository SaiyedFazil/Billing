"use client";

import { KeyRound, Trash2 } from "lucide-react";

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
  onDelete,
  disabled,
}: {
  row: UserRow;
  currentUserId: string;
  onReset: (row: UserRow) => void;
  onDelete: (row: UserRow) => void;
  disabled: boolean;
}) {
  const isSelf = row.id === currentUserId;
  const isLocked = row.lockedUntil !== null && row.lockedUntil > new Date();

  return (
    <TableRow>
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
              <span className="font-mono break-all">{row.username}</span>
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
        {isLocked ? (
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
              label: "Delete",
              icon: Trash2,
              onSelect: () => onDelete(row),
              disabled: disabled || isSelf,
              disabledReason: isSelf
                ? "You can't delete your own account"
                : undefined,
              destructive: true,
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
          aria-label={`Delete ${row.name}`}
          title={isSelf ? "You can't delete your own account" : undefined}
          onClick={() => onDelete(row)}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive max-lg:hidden"
        >
          <Trash2 className="size-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
