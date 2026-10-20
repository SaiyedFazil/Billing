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
import { Textarea } from "@/components/ui/textarea";
import {
  EXPENSE_MODE_LABELS,
  ONLINE_EXPENSE_MODES,
} from "@/constants/expense-modes";
import { cn } from "@/lib/utils";
import type { ExpenseCategoryRow } from "@/types/expense.types";

import type { ExpenseFormState } from "./hooks/useExpenseForm";

/** One 40px segmented choice, selected in the soft brand fill. */
function Choice({
  selected,
  onSelect,
  disabled,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "h-10 cursor-pointer rounded-xl border bg-card px-3 text-sm font-semibold transition-colors disabled:opacity-50",
        selected
          ? "border-brand bg-brand-soft text-brand-ink"
          : "hover:bg-muted/60",
      )}
    >
      {children}
    </button>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-destructive">{message}</p> : null;
}

export function ExpenseDialog({
  open,
  onOpenChange,
  form,
  setField,
  fieldErrors,
  categories,
  today,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ExpenseFormState;
  setField: <K extends keyof ExpenseFormState>(
    key: K,
    value: ExpenseFormState[K],
  ) => void;
  fieldErrors: Record<string, string>;
  categories: ExpenseCategoryRow[];
  today: string;
  isPending: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit expense" : "Add expense"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="expense-amount">Amount</Label>
            <MoneyInput
              id="expense-amount"
              value={form.amount}
              onChange={(value) => setField("amount", value)}
              invalid={Boolean(fieldErrors.amount)}
              disabled={isPending}
              autoFocus
              placeholder="0.00"
              className="h-12 text-left font-heading text-xl font-bold"
            />
            <FieldError message={fieldErrors.amount} />
          </div>

          <div className="space-y-2">
            <Label id="expense-paid-by">Paid by</Label>
            <div
              role="radiogroup"
              aria-labelledby="expense-paid-by"
              className="grid grid-cols-2 gap-2"
            >
              <Choice
                selected={form.group === "CASH"}
                onSelect={() => setField("group", "CASH")}
                disabled={isPending}
              >
                Cash
              </Choice>
              <Choice
                selected={form.group === "ONLINE"}
                onSelect={() => setField("group", "ONLINE")}
                disabled={isPending}
              >
                Online
              </Choice>
            </div>
            {form.group === "ONLINE" ? (
              <div
                role="radiogroup"
                aria-label="Online by"
                className="grid grid-cols-3 gap-2"
              >
                {ONLINE_EXPENSE_MODES.map((mode) => (
                  <Choice
                    key={mode}
                    selected={form.onlineMode === mode}
                    onSelect={() => setField("onlineMode", mode)}
                    disabled={isPending}
                  >
                    {EXPENSE_MODE_LABELS[mode]}
                  </Choice>
                ))}
              </div>
            ) : null}
            <FieldError message={fieldErrors.mode} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="expense-category">Category</Label>
              <Select
                value={form.categoryId}
                disabled={isPending}
                onValueChange={(value) => setField("categoryId", value)}
              >
                <SelectTrigger
                  id="expense-category"
                  className="h-10 w-full"
                  aria-invalid={Boolean(fieldErrors.categoryId)}
                >
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={fieldErrors.categoryId} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={form.expenseDate}
                max={today}
                disabled={isPending}
                className="h-10"
                aria-invalid={Boolean(fieldErrors.expenseDate)}
                onChange={(event) =>
                  setField("expenseDate", event.target.value)
                }
              />
              <FieldError message={fieldErrors.expenseDate} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expense-paid-to">
              Paid to{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </Label>
            <Input
              id="expense-paid-to"
              value={form.paidTo}
              maxLength={80}
              disabled={isPending}
              className="h-10"
              placeholder="e.g. Ravi Vegetables"
              aria-invalid={Boolean(fieldErrors.paidTo)}
              onChange={(event) => setField("paidTo", event.target.value)}
            />
            <FieldError message={fieldErrors.paidTo} />
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="expense-note">
                Note{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {form.note.length}/200
              </span>
            </div>
            <Textarea
              id="expense-note"
              value={form.note}
              maxLength={200}
              rows={2}
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.note)}
              onChange={(event) => setField("note", event.target.value)}
            />
            <FieldError message={fieldErrors.note} />
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
              {isPending ? "Saving…" : "Save expense"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
