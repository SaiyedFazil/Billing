"use client";

import { LayoutGrid, Plus, SearchX } from "lucide-react";

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
import type { AdminItemRow } from "@/types/item.types";

import { ItemsTableToolbar } from "./components/ItemsTableToolbar";
import { CreateUpdateItemDialog } from "./create-update-item-dialog/CreateUpdateItemDialog";
import { useItemsTab } from "./hooks/useItemsTab";
import { ITEM_HEADERS, ItemTableRow } from "./ItemsColumns";

export function ItemsTab({
  items,
  categories,
}: {
  items: AdminItemRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const tab = useItemsTab({ items, categories });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Items"
        description="Everything the till can sell."
        actions={
          <Button onClick={tab.openCreate} disabled={categories.length === 0}>
            <Plus className="size-4.5" strokeWidth={2.25} />
            New item
          </Button>
        }
      />

      {categories.length === 0 ? (
        <TableEmptyState
          icon={LayoutGrid}
          title="Add a category first"
          description="Every item belongs to a category. Create one under Categories, then come back."
        />
      ) : (
        <>
          <ItemsTableToolbar
            search={tab.search}
            onSearchChange={tab.setSearch}
            categoryFilter={tab.categoryFilter}
            onCategoryFilterChange={tab.setCategoryFilter}
            categories={tab.categories}
          />

          {tab.visibleItems.length === 0 ? (
            <TableEmptyState
              icon={SearchX}
              title="No items match"
              description="Try a different search term or category."
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    {ITEM_HEADERS.map((header, index) => (
                      <TableHead
                        key={header || `col-${index}`}
                        className={
                          index === ITEM_HEADERS.length - 1 ? "text-right" : ""
                        }
                      >
                        {header}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tab.visibleItems.map((row) => (
                    <ItemTableRow
                      key={row.id}
                      row={row}
                      tone={tab.toneByCategoryId.get(row.categoryId)}
                      onEdit={tab.openEdit}
                      onDelete={tab.setPendingDelete}
                      onToggleAvailability={tab.toggleAvailability}
                      disabled={tab.isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
        </>
      )}

      <CreateUpdateItemDialog
        open={tab.dialogOpen}
        onOpenChange={tab.setDialogOpen}
        form={tab.form}
        setForm={tab.setForm}
        categories={tab.categories}
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
        description="It disappears from the billing screen immediately. Past bills keep this item, so reports and receipts are unaffected."
        confirmLabel="Remove"
        destructive
        isPending={tab.isPending}
        onConfirm={tab.confirmDelete}
      />
    </div>
  );
}
