import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { paymentMethodEnum, printerWidthEnum } from "./enums";
import { users } from "./users";

/**
 * Exactly one row, enforced by a boolean primary key constrained to true.
 * Everything here appears on the printed receipt.
 */
export const shopSettings = pgTable(
  "shop_settings",
  {
    id: boolean("id").primaryKey().default(true),
    shopName: text("shop_name").notNull(),
    addressLine: text("address_line"),
    phone: text("phone"),
    logoUrl: text("logo_url"),
    logoFileId: text("logo_file_id"),
    receiptFooter: text("receipt_footer"),
    // The receipt heads with the black Mobito logo, or with the shop name as
    // text — one or the other, never both: the logo already says the name.
    receiptShowLogo: boolean("receipt_show_logo").notNull().default(true),
    printerWidth: printerWidthEnum("printer_width").notNull().default("MM_80"),
    currencyCode: text("currency_code").notNull().default("INR"),
    // Which payment buttons the till offers. History is never filtered by it:
    // a bill keeps the method it was paid with even after it is switched off.
    paymentMethods: paymentMethodEnum("payment_methods")
      .array()
      .notNull()
      .default(["CASH", "UPI", "CARD", "OTHER"]),
    // Drives business_date and every "today" report.
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("shop_settings_singleton", sql`${table.id}`),
    // The till must always have at least one button to press. Enforced here as
    // well as in Zod, so no path can leave the shop unable to take money.
    //
    // cardinality(), not array_length(): array_length('{}', 1) returns NULL,
    // and a CHECK that evaluates to NULL is treated as satisfied — so the
    // obvious spelling would let the empty array straight through.
    check(
      "shop_settings_payment_methods_not_empty",
      sql`cardinality(${table.paymentMethods}) >= 1`,
    ),
  ],
);

export type ShopSettings = typeof shopSettings.$inferSelect;
export type NewShopSettings = typeof shopSettings.$inferInsert;
