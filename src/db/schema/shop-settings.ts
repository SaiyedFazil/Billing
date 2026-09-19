import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { printerWidthEnum } from "./enums";
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
    printerWidth: printerWidthEnum("printer_width").notNull().default("MM_80"),
    currencyCode: text("currency_code").notNull().default("INR"),
    // Drives business_date and every "today" report.
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("shop_settings_singleton", sql`${table.id}`)],
);

export type ShopSettings = typeof shopSettings.$inferSelect;
export type NewShopSettings = typeof shopSettings.$inferInsert;
