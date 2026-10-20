import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { billItems, bills, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import { toAmount } from "@/lib/utils/money";
import { getShopSettings } from "@/server/settings/settings-queries";
import type { ReceiptData } from "@/types/bill.types";
import type {
  BillLedgerFilters,
  BillLedgerPage,
  BillLedgerRow,
} from "@/types/report.types";

export async function getReceipt(billId: string): Promise<ReceiptData | null> {
  const [bill] = await db
    .select({
      billNumber: bills.billNumber,
      businessDate: bills.businessDate,
      createdAt: bills.createdAt,
      subtotal: bills.subtotal,
      discount: bills.discount,
      total: bills.total,
      paymentMethod: bills.paymentMethod,
      tendered: bills.tendered,
      changeDue: bills.changeDue,
      cashierName: users.name,
    })
    .from(bills)
    .innerJoin(users, eq(users.id, bills.createdBy))
    .where(eq(bills.id, billId))
    .limit(1);

  if (!bill) return null;

  // Snapshot columns only — never join to `items` for a name or price.
  // See spec §6 Principle 2.
  const lines = await db
    .select({
      itemName: billItems.itemName,
      quantity: billItems.quantity,
      unitPrice: billItems.unitPrice,
      lineTotal: billItems.lineTotal,
    })
    .from(billItems)
    .where(eq(billItems.billId, billId))
    .orderBy(asc(billItems.createdAt), asc(billItems.itemName));

  const settings = await getShopSettings();

  return {
    ...bill,
    lines,
    shop: {
      name: settings.shopName,
      addressLine: settings.addressLine,
      phone: settings.phone,
      receiptFooter: settings.receiptFooter,
      showLogo: settings.receiptShowLogo,
      printerWidth: settings.printerWidth,
      timezone: settings.timezone,
    },
  };
}

export async function listCashiers(): Promise<
  Array<{ id: string; name: string }>
> {
  return withConnectionRetry(async () =>
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .orderBy(asc(users.name)),
  );
}

/**
 * The auditor's view: every bill, voided ones included, newest first.
 *
 * Filtered and paginated in SQL — never fetch the whole table and slice it in
 * JavaScript, which would fall over after a few thousand bills.
 */
export async function listBills(
  filters: BillLedgerFilters,
  page: number,
  pageSize: number,
): Promise<BillLedgerPage> {
  return withConnectionRetry(async () => {
    const conditions: SQL[] = [
      gte(bills.businessDate, filters.from),
      lte(bills.businessDate, filters.to),
    ];

    if (filters.cashierId)
      conditions.push(eq(bills.createdBy, filters.cashierId));
    if (filters.paymentMethod) {
      conditions.push(eq(bills.paymentMethod, filters.paymentMethod));
    }
    if (filters.billNumber !== undefined) {
      conditions.push(eq(bills.billNumber, filters.billNumber));
    }

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: bills.id,
          billNumber: bills.billNumber,
          businessDate: bills.businessDate,
          createdAt: bills.createdAt,
          total: bills.total,
          paymentMethod: bills.paymentMethod,
          status: bills.status,
          cashierName: users.name,
          lineCount: sql<number>`
            (SELECT count(*)::int FROM ${billItems}
             WHERE ${billItems.billId} = ${bills.id})
          `,
        })
        .from(bills)
        .innerJoin(users, eq(users.id, bills.createdBy))
        .where(where)
        .orderBy(desc(bills.businessDate), desc(bills.billNumber))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(bills).where(where),
    ]);

    return {
      rows: rows.map((row) => ({
        ...row,
        total: toAmount(row.total),
      })) satisfies BillLedgerRow[],
      total: totalRow?.value ?? 0,
      page,
      pageSize,
    };
  });
}
