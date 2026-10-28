import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import { db } from "@/db";
import { billItems, billPayments, bills, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import { SPLIT, type PaymentMethod } from "@/constants/payment-methods";
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

  // The three reads below depend only on the bill existing, so they run
  // together: one round trip to the database instead of three in a row.
  //
  // Snapshot columns only — never join to `items` for a name or price.
  // See spec §6 Principle 2.
  const linesQuery = db
    .select({
      itemName: billItems.itemName,
      quantity: billItems.quantity,
      unitPrice: billItems.unitPrice,
      lineTotal: billItems.lineTotal,
    })
    .from(billItems)
    .where(eq(billItems.billId, billId))
    .orderBy(asc(billItems.createdAt), asc(billItems.itemName));

  // One line for a one-method bill, two to four for a split, in display order.
  const paymentsQuery = db
    .select({
      method: billPayments.method,
      amount: billPayments.amount,
      tendered: billPayments.tendered,
      changeDue: billPayments.changeDue,
    })
    .from(billPayments)
    .where(eq(billPayments.billId, billId))
    .orderBy(asc(billPayments.position));

  const [lines, payments, settings] = await Promise.all([
    linesQuery,
    paymentsQuery,
    getShopSettings(),
  ]);

  return {
    ...bill,
    lines,
    payments: payments.map((payment) => ({
      method: payment.method,
      amount: toAmount(payment.amount),
      tendered: payment.tendered === null ? null : toAmount(payment.tendered),
      changeDue:
        payment.changeDue === null ? null : toAmount(payment.changeDue),
    })),
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
    if (filters.paymentMethod === SPLIT) {
      conditions.push(eq(bills.paymentMethod, SPLIT));
    } else if (filters.paymentMethod) {
      // Any bill with a line in this method: a one-method bill, or a split
      // that used it.
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(billPayments)
            .where(
              and(
                eq(billPayments.billId, bills.id),
                eq(billPayments.method, filters.paymentMethod),
              ),
            ),
        ),
      );
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
          // A split bill's lines for the row's hover text; NULL otherwise.
          // Amounts are cast ::text so JSON never turns them into doubles.
          splitPayments: sql<Array<{
            method: PaymentMethod;
            amount: string;
          }> | null>`
            (SELECT json_agg(
               json_build_object(
                 'method', ${billPayments.method},
                 'amount', ${billPayments.amount}::text
               ) ORDER BY ${billPayments.position}
             )
             FROM ${billPayments}
             WHERE ${billPayments.billId} = ${bills.id}
               AND ${bills.paymentMethod} = 'SPLIT')
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
        splitPayments:
          row.splitPayments?.map((part) => ({
            method: part.method,
            amount: toAmount(part.amount),
          })) ?? null,
      })) satisfies BillLedgerRow[],
      total: totalRow?.value ?? 0,
      page,
      pageSize,
    };
  });
}
