"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import type { Role } from "@/constants/roles";
import {
  createUserAction,
  deleteUserAction,
  resetPasswordAction,
} from "@/server/users/users-actions";
import type { UserRow } from "@/types/user.types";

export type CreateUserFormState = {
  username: string;
  name: string;
  role: Role;
  password: string;
};

const EMPTY_USER: CreateUserFormState = {
  username: "",
  name: "",
  role: "ADMIN",
  password: "",
};

export function useUsersTab() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateUserFormState>(EMPTY_USER);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const openCreate = useCallback(() => {
    setForm(EMPTY_USER);
    setFieldErrors({});
    setCreateOpen(true);
  }, []);

  const submitCreate = useCallback(() => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createUserAction(form);
      if (result.ok) {
        toast.success(`${form.name} can now sign in as ${form.username}`);
        setCreateOpen(false);
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router]);

  const submitReset = useCallback(() => {
    if (!resetTarget) return;
    setFieldErrors({});

    startTransition(async () => {
      const result = await resetPasswordAction({
        id: resetTarget.id,
        password: newPassword,
      });
      if (result.ok) {
        toast.success(`Password reset for ${resetTarget.name}`);
        setResetTarget(null);
        setNewPassword("");
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [newPassword, resetTarget, router]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    const target = deleteTarget;

    startTransition(async () => {
      const result = await deleteUserAction({ id: target.id });
      if (result.ok) {
        toast.success(`${target.name}'s account is deleted`);
      } else {
        toast.error(result.error.message);
      }
      setDeleteTarget(null);
      router.refresh();
    });
  }, [deleteTarget, router]);

  return {
    isPending,
    createOpen,
    setCreateOpen,
    form,
    setForm,
    fieldErrors,
    openCreate,
    submitCreate,
    resetTarget,
    setResetTarget,
    newPassword,
    setNewPassword,
    submitReset,
    deleteTarget,
    setDeleteTarget,
    confirmDelete,
  };
}
