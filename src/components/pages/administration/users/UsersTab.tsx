"use client";

import { Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { TableCard } from "@/components/custom/TableCard";
import { PageHeader } from "@/components/layout/PageHeader";
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
import { USER_COLUMNS, UserTableRow } from "./UsersColumns";

export function UsersTab({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const tab = useUsersTab();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Who can sign in. A deleted account's name stays on its past bills."
        actions={
          <Button onClick={tab.openCreate}>
            <Plus className="size-4.5" strokeWidth={2.25} />
            New account
          </Button>
        }
      />

      <TableCard>
        <Table>
          <TableHeader>
            <TableRow>
              {USER_COLUMNS.map((column, index) => (
                <TableHead
                  key={column.label || `col-${index}`}
                  className={"className" in column ? column.className : ""}
                >
                  {column.label}
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
                onDelete={tab.setDeleteTarget}
                disabled={tab.isPending}
              />
            ))}
          </TableBody>
        </Table>
      </TableCard>

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
        open={tab.deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) tab.setDeleteTarget(null);
        }}
        title={`Delete ${tab.deleteTarget?.name}'s account?`}
        description="They are signed out at once, wherever they are signed in, and cannot sign in again. Their past bills keep their name. This cannot be undone."
        confirmLabel="Delete account"
        destructive
        isPending={tab.isPending}
        onConfirm={tab.confirmDelete}
      />
    </div>
  );
}
