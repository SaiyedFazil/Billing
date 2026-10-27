"use client";

import { UtensilsCrossed } from "lucide-react";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import type { PaymentMethod } from "@/constants/payment-methods";
import type { MenuCategory } from "@/types/item.types";

import { BillBar } from "./components/BillBar";
import { BillSheet } from "./components/BillSheet";
import { CartPanel } from "./components/CartPanel";
import { MenuGrid } from "./components/MenuGrid";
import { PriceChangedDialog } from "./components/PriceChangedDialog";
import { useBillPage } from "./hooks/useBillPage";
import { useBillSheet } from "./hooks/useBillSheet";

export function BillPage({
  menu,
  paymentMethods,
}: {
  menu: MenuCategory[];
  paymentMethods: PaymentMethod[];
}) {
  const bill = useBillPage({ menu, paymentMethods });
  const { open, openSheet, closeSheet, barRef } = useBillSheet();

  // Hooks have already run, so an early return here is safe.
  if (menu.length === 0) {
    return (
      <div className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center p-6 lg:min-h-dvh">
        <TableEmptyState
          icon={UtensilsCrossed}
          title="No items on the menu yet"
          description="The owner needs to add categories and items before billing can start."
        />
      </div>
    );
  }

  // Tablets and desktops pin the till to the viewport (under the tablet's
  // top bar) so the cart never scrolls away; phones scroll the page instead.
  return (
    <div className="grid grid-cols-1 gap-5 p-4 sm:p-5 md:h-[calc(100dvh-3.5rem)] md:grid-cols-[minmax(0,1fr)_320px] md:overflow-hidden lg:h-dvh lg:grid-cols-[minmax(0,1fr)_360px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_404px] xl:px-6">
      <MenuGrid
        categories={bill.categories}
        activeCategoryId={bill.activeCategoryId}
        onCategoryChange={bill.setActiveCategoryId}
        search={bill.search}
        onSearchChange={bill.setSearch}
        onSearchEnter={bill.addBySearch}
        items={bill.visibleItems}
        onSelect={bill.addItem}
        quantityByItemId={bill.quantityByItemId}
        toneByCategoryId={bill.toneByCategoryId}
        inert={open}
      />

      {/* Phones: a sheet over the menu. From md: the bill column, as before. */}
      <BillSheet open={open} onClose={closeSheet}>
        <CartPanel
          lines={bill.lines}
          itemCount={bill.itemCount}
          onSetQuantity={bill.setQuantity}
          onRemove={bill.removeItem}
          subtotal={bill.subtotal}
          discountInput={bill.discountInput}
          onDiscountChange={bill.setDiscountInput}
          discountExceedsSubtotal={bill.discountExceedsSubtotal}
          total={bill.total}
          paymentMethods={bill.paymentMethods}
          paymentMethod={bill.paymentMethod}
          onPaymentMethodChange={bill.setPaymentMethod}
          tenderedInput={bill.tenderedInput}
          onTenderedChange={bill.setTenderedInput}
          changeDue={bill.changeDue}
          showSplit={bill.showSplit}
          splitAvailable={bill.splitAvailable}
          split={bill.split}
          canSave={bill.canSave}
          isSaving={bill.isSaving}
          error={bill.error}
          onSave={bill.save}
        />
      </BillSheet>

      <BillBar
        ref={barRef}
        itemCount={bill.itemCount}
        total={bill.total}
        expanded={open}
        onOpen={openSheet}
      />

      <PriceChangedDialog
        message={bill.priceChange}
        step={bill.priceChangeStep}
        onConfirm={bill.confirmPriceChange}
        onDismiss={bill.dismissPriceChange}
        isSaving={bill.isSaving}
      />
    </div>
  );
}
