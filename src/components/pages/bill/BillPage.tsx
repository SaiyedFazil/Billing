"use client";

import type { MenuCategory } from "@/types/item.types";

import { CartPanel } from "./components/CartPanel";
import { MenuGrid } from "./components/MenuGrid";
import { PriceChangedDialog } from "./components/PriceChangedDialog";
import { useBillPage } from "./hooks/useBillPage";

export function BillPage({ menu }: { menu: MenuCategory[] }) {
  const bill = useBillPage({ menu });

  // Hooks have already run, so an early return here is safe.
  if (menu.length === 0) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <p className="text-muted-foreground max-w-sm text-center">
          No items on the menu yet. The owner needs to add categories and items
          before billing can start.
        </p>
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <MenuGrid
        categories={bill.categories}
        activeCategoryId={bill.activeCategoryId}
        onCategoryChange={bill.setActiveCategoryId}
        search={bill.search}
        onSearchChange={bill.setSearch}
        onSearchEnter={bill.addBySearch}
        items={bill.visibleItems}
        onSelect={bill.addItem}
      />

      <CartPanel
        lines={bill.lines}
        onSetQuantity={bill.setQuantity}
        onRemove={bill.removeItem}
        subtotal={bill.subtotal}
        discountInput={bill.discountInput}
        onDiscountChange={bill.setDiscountInput}
        discountExceedsSubtotal={bill.discountExceedsSubtotal}
        total={bill.total}
        paymentMethod={bill.paymentMethod}
        onPaymentMethodChange={bill.setPaymentMethod}
        tenderedInput={bill.tenderedInput}
        onTenderedChange={bill.setTenderedInput}
        changeDue={bill.changeDue}
        canSave={bill.canSave}
        isSaving={bill.isSaving}
        error={bill.error}
        onSave={bill.save}
      />

      <PriceChangedDialog
        message={bill.priceChange}
        onConfirm={bill.confirmPriceChange}
        onDismiss={bill.dismissPriceChange}
        isSaving={bill.isSaving}
      />
    </div>
  );
}
