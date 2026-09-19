"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { ItemFormState } from "../hooks/useItemsTab";
import { ItemImageUploader } from "./components/ItemImageUploader";

export function CreateUpdateItemDialog({
  open,
  onOpenChange,
  form,
  setForm,
  categories,
  fieldErrors,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ItemFormState;
  setForm: (next: ItemFormState) => void;
  categories: Array<{ id: string; name: string }>;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <ItemImageUploader
            imageUrl={form.imageUrl}
            disabled={isPending}
            onChange={(next) => setForm({ ...form, ...next })}
          />

          <div className="space-y-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-category">Category</Label>
              <Select
                value={form.categoryId}
                disabled={isPending}
                onValueChange={(value) =>
                  setForm({ ...form, categoryId: value })
                }
              >
                <SelectTrigger id="item-category" className="w-full">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.categoryId ? (
                <p className="text-destructive text-sm">
                  {fieldErrors.categoryId}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-price">Price ₹</Label>
              <MoneyInput
                id="item-price"
                value={form.priceInput}
                disabled={isPending}
                invalid={Boolean(fieldErrors.price)}
                onChange={(value) => setForm({ ...form, priceInput: value })}
              />
              {fieldErrors.price ? (
                <p className="text-destructive text-sm">{fieldErrors.price}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-sort">Display order</Label>
              <Input
                id="item-sort"
                inputMode="numeric"
                value={form.sortOrder}
                disabled={isPending}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "" || /^\d{0,4}$/.test(next)) {
                    setForm({ ...form, sortOrder: next });
                  }
                }}
              />
            </div>

            <div className="flex h-10 items-center gap-2.5">
              <Switch
                id="item-available"
                checked={form.isAvailable}
                disabled={isPending}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isAvailable: checked })
                }
              />
              <Label htmlFor="item-available" className="font-normal">
                Available today
              </Label>
            </div>
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
