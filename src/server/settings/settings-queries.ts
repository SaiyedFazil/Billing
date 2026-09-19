import { db } from "@/db";
import type { ShopSettings } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";

export async function getShopSettings(): Promise<ShopSettings> {
  return withConnectionRetry(async () => {
    const settings = await db.query.shopSettings.findFirst();
    if (!settings) {
      throw new Error(
        "Shop settings row is missing. Run `npm run db:seed` before using the app.",
      );
    }
    return settings;
  });
}

/**
 * The name shown in the app shell. Never throws: the shell wraps every page,
 * so a missing row or a failed read shows a generic name rather than taking
 * the whole app down. Pages that need settings still fail loudly on their own.
 */
export async function getShopName(): Promise<string> {
  try {
    return await withConnectionRetry(async () => {
      const settings = await db.query.shopSettings.findFirst({
        columns: { shopName: true },
      });
      return settings?.shopName ?? "Billing";
    });
  } catch (error) {
    console.error("Could not read the shop name for the app shell:", error);
    return "Billing";
  }
}

export async function getShopTimezone(): Promise<string> {
  return withConnectionRetry(async () => {
    const settings = await db.query.shopSettings.findFirst({
      columns: { timezone: true },
    });
    return settings?.timezone ?? "Asia/Kolkata";
  });
}
