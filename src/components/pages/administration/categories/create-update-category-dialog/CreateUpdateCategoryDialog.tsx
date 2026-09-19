"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CategoryFormState } from "../hooks/useCategoriesTab";

export function CreateUpdateCategoryDialog({
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
  form: CategoryFormState;
  setForm: (next: CategoryFormState) => void;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={form.name}
              autoFocus
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            {fieldErrors.name ? (
              <p className="text-destructive text-sm">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-sort">Display order</Label>
            <Input
              id="category-sort"
              inputMode="numeric"
              value={form.sortOrder}
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.sortOrder)}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "" || /^\d{0,4}$/.test(next)) {
                  setForm({ ...form, sortOrder: next });
                }
              }}
            />
            <p className="text-muted-foreground text-xs">
              Lower numbers appear first on the billing screen.
            </p>
            {fieldErrors.sortOrder ? (
              <p className="text-destructive text-sm">{fieldErrors.sortOrder}</p>
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
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
