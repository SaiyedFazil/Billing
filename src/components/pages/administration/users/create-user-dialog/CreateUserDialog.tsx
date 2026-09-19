"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/constants/roles";

import type { CreateUserFormState } from "../hooks/useUsersTab";

export function CreateUserDialog({
  open,
  onOpenChange,
  form,
  setForm,
  fieldErrors,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CreateUserFormState;
  setForm: (next: CreateUserFormState) => void;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            Give the person their username and password directly — there is no
            email invitation.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              value={form.name}
              autoFocus
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            <p className="text-muted-foreground text-xs">
              Printed on every receipt this person creates.
            </p>
            {fieldErrors.name ? (
              <p className="text-destructive text-sm">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              value={form.username}
              autoComplete="off"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.username)}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
            />
            {fieldErrors.username ? (
              <p className="text-destructive text-sm">{fieldErrors.username}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select
              value={form.role}
              disabled={isPending}
              onValueChange={(value) =>
                setForm({ ...form, role: value as Role })
              }
            >
              <SelectTrigger id="user-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Cashiers can bill and view reports. Owners can also change the
              menu, prices and accounts.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="password"
              value={form.password}
              autoComplete="new-password"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
            />
            {fieldErrors.password ? (
              <p className="text-destructive text-sm">{fieldErrors.password}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
