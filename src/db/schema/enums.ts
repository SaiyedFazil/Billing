import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "SUPERADMIN"]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "UPI",
  "CARD",
  "OTHER",
]);

export const billStatusEnum = pgEnum("bill_status", ["COMPLETED", "VOID"]);

export const printerWidthEnum = pgEnum("printer_width", ["MM_80", "MM_58"]);
