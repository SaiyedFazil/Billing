import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "SUPERADMIN"]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "UPI",
  "CARD",
  "OTHER",
]);

export const billStatusEnum = pgEnum("bill_status", ["COMPLETED", "VOID"]);

// VOID_RETURN arrives with the void UI, through its own migration.
export const stockMovementTypeEnum = pgEnum("stock_movement_type", [
  "OPENING",
  "RESTOCK",
  "SALE",
  "WASTAGE",
  "CORRECTION",
]);

export const printerWidthEnum = pgEnum("printer_width", ["MM_80", "MM_58"]);

// Its own list rather than payment_method: bank transfer is not a till option,
// and "Other" is not wanted for expenses. CASH is offline; the rest are online.
export const expenseModeEnum = pgEnum("expense_mode", [
  "CASH",
  "UPI",
  "CARD",
  "BANK_TRANSFER",
]);
