import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { SPLIT } from "@/constants/payment-methods";
import { db } from "@/db";
import { billItems, billPayments, bills } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import { businessDate } from "@/lib/utils/dates";
import { add, divide, isZero, toAmount, ZERO } from "@/lib/utils/money";
import { getShopTimezone } from "@/server/settings/settings-queries";
import type {
  DashboardStats,
  ItemSalesRow,
  PaymentBreakdownRow,
  SalesByDayRow,
} from "@/types/report.types";

/**
 * Voided bills are excluded from every money figure. They remain visible in
 * the ledger — a void is a fact about the day, not revenue.
 */
const COMPLETED = eq(bills.status, "COMPLETED");

function inRange(from: string, to: string) {
  return and(
    COMPLETED,
    gte(bills.businessDate, from),
    lte(bills.businessDate, to),
  );
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return withConnectionRetry(async () => {
    const timeZone = await getShopTimezone();
    const today = businessDate(new Date(), timeZone);

    // Aggregates over numeric columns stay numeric, and the driver returns
    // those as decimal STRINGS. Never cast to ::int — that would truncate
    // every amount to whole rupees.
    const [totals] = await db
      .select({
        billCount: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${bills.subtotal}), 0)::text`,
        discount: sql<string>`coalesce(sum(${bills.discount}), 0)::text`,
        net: sql<string>`coalesce(sum(${bills.total}), 0)::text`,
      })
      .from(bills)
      .where(and(COMPLETED, eq(bills.businessDate, today)));

    // Snapshot columns only — a renamed item must not change today's top seller.
    const [topItem] = await db
      .select({
        itemName: billItems.itemName,
        quantity: sql<number>`sum(${billItems.quantity})::int`,
        revenue: sql<string>`sum(${billItems.lineTotal})::text`,
      })
      .from(billItems)
      .innerJoin(bills, eq(bills.id, billItems.billId))
      .where(and(COMPLETED, eq(bills.businessDate, today)))
      .groupBy(billItems.itemName)
      .orderBy(desc(sql`sum(${billItems.lineTotal})`))
      .limit(1);

    const billCount = totals?.billCount ?? 0;
    const net = toAmount(totals?.net ?? "0");

    return {
      businessDate: today,
      billCount,
      gross: toAmount(totals?.gross ?? "0"),
      discount: toAmount(totals?.discount ?? "0"),
      net,
      // Averaging is the one money operation here that cannot be exact;
      // rounding it once, at the end, is correct.
      averageBill: billCount === 0 ? ZERO : divide(net, billCount),
      topItemName: topItem?.itemName ?? null,
      topItemQuantity: topItem?.quantity ?? 0,
    };
  });
}

export async function getSalesByDay(
  from: string,
  to: string,
): Promise<SalesByDayRow[]> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({
        businessDate: bills.businessDate,
        billCount: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${bills.subtotal}), 0)::text`,
        discount: sql<string>`coalesce(sum(${bills.discount}), 0)::text`,
        net: sql<string>`coalesce(sum(${bills.total}), 0)::text`,
      })
      .from(bills)
      .where(inRange(from, to))
      .groupBy(bills.businessDate)
      .orderBy(asc(bills.businessDate));

    return rows.map((row) => ({
      ...row,
      gross: toAmount(row.gross),
      discount: toAmount(row.discount),
      net: toAmount(row.net),
    }));
  });
}

/** Same shape as getSalesByDay; named separately because the chart may diverge. */
export async function getSalesTrend(
  from: string,
  to: string,
): Promise<SalesByDayRow[]> {
  return getSalesByDay(from, to);
}

/**
 * Summed from the payment lines, never from bills.payment_method: a split
 * bill's money belongs to its lines, so it counts once under each method it
 * used. One line per method per bill, so billCount still counts bills.
 */
export async function getPaymentBreakdown(
  from: string,
  to: string,
): Promise<PaymentBreakdownRow[]> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({
        paymentMethod: billPayments.method,
        billCount: sql<number>`count(*)::int`,
        net: sql<string>`coalesce(sum(${billPayments.amount}), 0)::text`,
      })
      .from(billPayments)
      .innerJoin(bills, eq(bills.id, billPayments.billId))
      .where(inRange(from, to))
      .groupBy(billPayments.method)
      .orderBy(desc(sql`sum(${billPayments.amount})`));

    return rows.map((row) => ({ ...row, net: toAmount(row.net) }));
  });
}

/**
 * True when the range holds a completed split bill. The Sales card uses it to
 * explain why the per-method bill counts can add up to more than the bills.
 */
export async function hasSplitBills(
  from: string,
  to: string,
): Promise<boolean> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({ id: bills.id })
      .from(bills)
      .where(and(inRange(from, to), eq(bills.paymentMethod, SPLIT)))
      .limit(1);

    return rows.length > 0;
  });
}

export async function getItemSales(
  from: string,
  to: string,
): Promise<ItemSalesRow[]> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({
        itemName: billItems.itemName,
        categoryName: billItems.categoryName,
        quantity: sql<number>`sum(${billItems.quantity})::int`,
        revenue: sql<string>`sum(${billItems.lineTotal})::text`,
      })
      .from(billItems)
      .innerJoin(bills, eq(bills.id, billItems.billId))
      .where(inRange(from, to))
      .groupBy(billItems.itemName, billItems.categoryName)
      .orderBy(desc(sql`sum(${billItems.lineTotal})`));

    const totalRevenue = rows.reduce(
      (sum, row) => add(sum, toAmount(row.revenue)),
      ZERO,
    );

    return rows.map((row) => ({
      ...row,
      revenue: toAmount(row.revenue),
      // sharePercent is a display percentage, not money — a float is fine
      // here, and it is never summed back into an amount.
      sharePercent: isZero(totalRevenue)
        ? 0
        : Math.round((Number(row.revenue) / Number(totalRevenue)) * 1000) / 10,
    }));
  });
}
