"use server";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { billItems, bills, categories, items, users } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { csvAmount, toCsv } from "@/lib/utils/csv";
import { type ActionResult, ok } from "@/lib/utils/result";

export type ExportBundle = {
  bills: string;
  billItems: string;
  items: string;
};

/**
 * The owner's monthly safety net. Neon's free plan keeps only a short restore
 * window, and this database is the shop's entire sales ledger. See spec §16.1.
 */
export async function exportAllDataAction(): Promise<
  ActionResult<ExportBundle>
> {
  return guarded(async () => {
    await requireSuperadmin();

    const billRows = await db
      .select({
        businessDate: bills.businessDate,
        billNumber: bills.billNumber,
        createdAt: bills.createdAt,
        cashier: users.name,
        subtotal: bills.subtotal,
        discount: bills.discount,
        total: bills.total,
        paymentMethod: bills.paymentMethod,
        status: bills.status,
        id: bills.id,
      })
      .from(bills)
      .innerJoin(users, eq(users.id, bills.createdBy))
      .orderBy(asc(bills.businessDate), asc(bills.billNumber));

    const lineRows = await db
      .select({
        billId: billItems.billId,
        businessDate: bills.businessDate,
        billNumber: bills.billNumber,
        itemName: billItems.itemName,
        categoryName: billItems.categoryName,
        unitPrice: billItems.unitPrice,
        quantity: billItems.quantity,
        lineTotal: billItems.lineTotal,
      })
      .from(billItems)
      .innerJoin(bills, eq(bills.id, billItems.billId))
      .orderBy(asc(bills.businessDate), asc(bills.billNumber));

    const itemRows = await db
      .select({
        name: items.name,
        categoryName: categories.name,
        price: items.price,
        isActive: items.isActive,
        isAvailable: items.isAvailable,
      })
      .from(items)
      .innerJoin(categories, eq(categories.id, items.categoryId))
      .orderBy(asc(categories.name), asc(items.name));

    return ok({
      bills: toCsv(billRows, [
        { header: "Date", value: (r) => r.businessDate },
        { header: "Bill No", value: (r) => r.billNumber },
        { header: "Time", value: (r) => r.createdAt.toISOString() },
        { header: "Cashier", value: (r) => r.cashier },
        { header: "Subtotal", value: (r) => csvAmount(r.subtotal) },
        { header: "Discount", value: (r) => csvAmount(r.discount) },
        { header: "Total", value: (r) => csvAmount(r.total) },
        { header: "Payment", value: (r) => r.paymentMethod },
        { header: "Status", value: (r) => r.status },
        { header: "Bill ID", value: (r) => r.id },
      ]),
      billItems: toCsv(lineRows, [
        { header: "Date", value: (r) => r.businessDate },
        { header: "Bill No", value: (r) => r.billNumber },
        { header: "Item", value: (r) => r.itemName },
        { header: "Category", value: (r) => r.categoryName },
        { header: "Unit Price", value: (r) => csvAmount(r.unitPrice) },
        { header: "Qty", value: (r) => r.quantity },
        { header: "Line Total", value: (r) => csvAmount(r.lineTotal) },
        { header: "Bill ID", value: (r) => r.billId },
      ]),
      items: toCsv(itemRows, [
        { header: "Item", value: (r) => r.name },
        { header: "Category", value: (r) => r.categoryName },
        { header: "Current Price", value: (r) => csvAmount(r.price) },
        { header: "On menu", value: (r) => (r.isActive ? "Yes" : "No") },
        { header: "Available", value: (r) => (r.isAvailable ? "Yes" : "No") },
      ]),
    });
  });
}
