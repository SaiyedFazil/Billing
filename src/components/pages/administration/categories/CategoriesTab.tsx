"use client";

import { Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CategoryRow } from "@/types/category.types";

import { CATEGORY_HEADERS, CategoryTableRow } from "./CategoriesColumns";
import { CreateUpdateCategoryDialog } from "./create-update-category-dialog/CreateUpdateCategoryDialog";
import { useCategoriesTab } from "./hooks/useCategoriesTab";

export function CategoriesTab({ categories }: { categories: CategoryRow[] }) {
  const tab = useCategoriesTab();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-muted-foreground text-sm">
            Groups the billing screen uses for its tabs.
          </p>
        </div>
        <Button onClick={tab.openCreate}>
          <Plus className="size-4" />
          New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <TableEmptyState
          title="No categories yet"
          description="Add a category before adding items — every item belongs to one."
          action={<Button onClick={tab.openCreate}>New category</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {CATEGORY_HEADERS.map((header, index) => (
                <TableHead
                  key={header || `actions-${index}`}
                  className={
                    index === CATEGORY_HEADERS.length - 1 ? "text-right" : ""
                  }
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((row) => (
              <CategoryTableRow
                key={row.id}
                row={row}
                onEdit={tab.openEdit}
                onDelete={tab.setPendingDelete}
                disabled={tab.isPending}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <CreateUpdateCategoryDialog
        open={tab.dialogOpen}
        onOpenChange={tab.setDialogOpen}
        form={tab.form}
        setForm={tab.setForm}
        fieldErrors={tab.fieldErrors}
        onSubmit={tab.submit}
        isPending={tab.isPending}
      />

      <ConfirmDialog
        open={tab.pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) tab.setPendingDelete(null);
        }}
        title={`Remove “${tab.pendingDelete?.name}”?`}
        description="It disappears from the billing screen. Past bills keep this category name, so reports are unaffected."
        confirmLabel="Remove"
        destructive
        isPending={tab.isPending}
        onConfirm={tab.confirmDelete}
      />
    </div>
  );
}
