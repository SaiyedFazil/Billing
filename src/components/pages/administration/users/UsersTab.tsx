"use client";

import { Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserRow } from "@/types/user.types";

import { CreateUserDialog } from "./create-user-dialog/CreateUserDialog";
import { useUsersTab } from "./hooks/useUsersTab";
import { ResetPasswordDialog } from "./reset-password-dialog/ResetPasswordDialog";
import { USER_HEADERS, UserTableRow } from "./UsersColumns";

export function UsersTab({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const tab = useUsersTab();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-muted-foreground text-sm">
            Who can sign in. Accounts are deactivated, never deleted — bills
            reference them.
          </p>
        </div>
        <Button onClick={tab.openCreate}>
          <Plus className="size-4" />
          New account
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {USER_HEADERS.map((header, index) => (
              <TableHead
                key={header || `col-${index}`}
                className={index === USER_HEADERS.length - 1 ? "text-right" : ""}
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((row) => (
            <UserTableRow
              key={row.id}
              row={row}
              currentUserId={currentUserId}
              onReset={tab.setResetTarget}
              onToggle={tab.setToggleTarget}
              disabled={tab.isPending}
            />
          ))}
        </TableBody>
      </Table>

      <CreateUserDialog
        open={tab.createOpen}
        onOpenChange={tab.setCreateOpen}
        form={tab.form}
        setForm={tab.setForm}
        fieldErrors={tab.fieldErrors}
        onSubmit={tab.submitCreate}
        isPending={tab.isPending}
      />

      <ResetPasswordDialog
        target={tab.resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            tab.setResetTarget(null);
            tab.setNewPassword("");
          }
        }}
        password={tab.newPassword}
        setPassword={tab.setNewPassword}
        fieldErrors={tab.fieldErrors}
        onSubmit={tab.submitReset}
        isPending={tab.isPending}
      />

      <ConfirmDialog
        open={tab.toggleTarget !== null}
        onOpenChange={(open) => {
          if (!open) tab.setToggleTarget(null);
        }}
        title={
          tab.toggleTarget?.isActive
            ? `Deactivate ${tab.toggleTarget?.name}?`
            : `Reactivate ${tab.toggleTarget?.name}?`
        }
        description={
          tab.toggleTarget?.isActive
            ? "They will not be able to sign in. Their past bills are unaffected and stay in the ledger under their name."
            : "They will be able to sign in again, and any lockout is cleared."
        }
        confirmLabel={tab.toggleTarget?.isActive ? "Deactivate" : "Reactivate"}
        destructive={tab.toggleTarget?.isActive}
        isPending={tab.isPending}
        onConfirm={tab.confirmToggle}
      />
    </div>
  );
}
