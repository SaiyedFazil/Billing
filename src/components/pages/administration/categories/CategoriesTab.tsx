"use client";

import { LayoutGrid, Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { TableCard } from "@/components/custom/TableCard";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { categoryTone } from "@/lib/utils/category-tone";
import type { CategoryRow } from "@/types/category.types";

import { CATEGORY_HEADERS, CategoryTableRow } from "./CategoriesColumns";
import { CreateUpdateCategoryDialog } from "./create-update-category-dialog/CreateUpdateCategoryDialog";
import { useCategoriesTab } from "./hooks/useCategoriesTab";

export function CategoriesTab({ categories }: { categories: CategoryRow[] }) {
  const tab = useCategoriesTab();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categories"
        description="Groups the billing screen uses for its tabs."
        actions={
          <Button onClick={tab.openCreate}>
            <Plus className="size-4.5" strokeWidth={2.25} />
            New category
          </Button>
        }
      />

      {categories.length === 0 ? (
        <TableEmptyState
          icon={LayoutGrid}
          title="No categories yet"
          description="Add a category before adding items — every item belongs to one."
          action={<Button onClick={tab.openCreate}>New category</Button>}
        />
      ) : (
        <TableCard>
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
              {categories.map((row, index) => (
                <CategoryTableRow
                  key={row.id}
                  row={row}
                  tone={categoryTone(index)}
                  onEdit={tab.openEdit}
                  onDelete={tab.setPendingDelete}
                  disabled={tab.isPending}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
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
