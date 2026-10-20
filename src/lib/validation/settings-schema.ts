import { z } from "zod";

import { PAYMENT_METHODS } from "@/constants/payment-methods";

export const PRINTER_WIDTHS = ["MM_80", "MM_58"] as const;
export type PrinterWidth = (typeof PRINTER_WIDTHS)[number];

export const PRINTER_WIDTH_LABELS: Record<PrinterWidth, string> = {
  MM_80: "80mm (standard)",
  MM_58: "58mm (narrow)",
};

export const settingsSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(1, "Shop name is required")
    .max(60, "Keep it under 60 characters so it fits the receipt"),
  addressLine: z.string().trim().max(80).nullable(),
  phone: z.string().trim().max(30).nullable(),
  receiptFooter: z.string().trim().max(120).nullable(),
  receiptShowLogo: z.boolean(),
  printerWidth: z.enum(PRINTER_WIDTHS),
  timezone: z.string().trim().min(1, "Timezone is required"),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

/**
 * Which payment buttons the till offers. Saved on its own, separately from the
 * receipt details above.
 *
 * The `.min(1)` mirrors the shop_settings_payment_methods_not_empty CHECK: the
 * shop must always have at least one way to take money. The array is sorted
 * into PAYMENT_METHODS order on save so the till's buttons never reshuffle
 * because of the order the owner happened to toggle them in.
 */
export const paymentMethodsSchema = z.object({
  paymentMethods: z
    .array(z.enum(PAYMENT_METHODS))
    .min(1, "Keep at least one payment method switched on")
    .transform((methods) =>
      PAYMENT_METHODS.filter((method) => methods.includes(method)),
    ),
});

export type PaymentMethodsInput = z.infer<typeof paymentMethodsSchema>;
