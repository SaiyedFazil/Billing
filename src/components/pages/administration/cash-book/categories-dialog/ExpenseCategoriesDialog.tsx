"use client";

import { Archive, Pencil } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ExpenseCategoryRow } from "@/types/expense.types";

import type { useExpenseCategories } from "./hooks/useExpenseCategories";

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

/**
 * The owner's spending categories. Retiring hides a category from the picker
 * but leaves every past expense filed under it.
 */
export function ExpenseCategoriesDialog({
  categories,
  state,
}: {
  categories: ExpenseCategoryRow[];
  state: ReturnType<typeof useExpenseCategories>;
}) {
  const onlyOne = categories.length <= 1;

  return (
    <>
      <Dialog open={state.open} onOpenChange={state.setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Expense categories</DialogTitle>
            <DialogDescription>
              What the shop spends on. Retiring one keeps past expenses as they
              are.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              state.add();
            }}
          >
            <div className="flex gap-2">
              <Input
                aria-label="New category name"
                value={state.newName}
                maxLength={40}
                placeholder="New category"
                disabled={state.isPending}
                className="h-10"
                aria-invalid={Boolean(state.fieldErrors.new)}
                onChange={(event) => state.setNewName(event.target.value)}
              />
              <Button type="submit" disabled={state.isPending}>
                Add
              </Button>
            </div>
            <FieldError message={state.fieldErrors.new} />
          </form>

          <ul className="max-h-80 divide-y overflow-y-auto rounded-xl border">
            {categories.map((row) =>
              state.renamingId === row.id ? (
                <li key={row.id} className="space-y-1.5 p-2">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      state.saveRename();
                    }}
                  >
                    <Input
                      aria-label={`New name for ${row.name}`}
                      value={state.renameValue}
                      maxLength={40}
                      autoFocus
                      disabled={state.isPending}
                      className="h-10"
                      aria-invalid={Boolean(state.fieldErrors[row.id])}
                      onChange={(event) =>
                        state.setRenameValue(event.target.value)
                      }
                    />
                    <Button type="submit" disabled={state.isPending}>
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={state.isPending}
                      onClick={state.cancelRename}
                    >
                      Cancel
                    </Button>
                  </form>
                  <FieldError message={state.fieldErrors[row.id]} />
                </li>
              ) : (
                <li
                  key={row.id}
                  className="flex items-center gap-1 py-1 pr-1 pl-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {row.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    aria-label={`Rename ${row.name}`}
                    disabled={state.isPending}
                    onClick={() => state.startRename(row)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-10"
                    aria-label={`Retire ${row.name}`}
                    title={
                      onlyOne
                        ? "Keep at least one category, or there's nothing to file expenses under."
                        : undefined
                    }
                    disabled={state.isPending || onlyOne}
                    onClick={() => state.askRetire(row)}
                  >
                    <Archive className="size-4" />
                  </Button>
                </li>
              ),
            )}
          </ul>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={state.pendingRetire !== null}
        onOpenChange={(open) => (open ? null : state.cancelRetire())}
        title={`Retire “${state.pendingRetire?.name ?? ""}”?`}
        description="Past expenses keep it, but it won't be offered for new ones."
        confirmLabel="Retire"
        destructive
        isPending={state.isPending}
        onConfirm={state.confirmRetire}
      />
    </>
  );
}
