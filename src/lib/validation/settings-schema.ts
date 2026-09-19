import { z } from "zod";

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
  printerWidth: z.enum(PRINTER_WIDTHS),
  timezone: z.string().trim().min(1, "Timezone is required"),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
