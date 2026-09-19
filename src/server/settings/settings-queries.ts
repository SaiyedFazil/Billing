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

export async function getShopTimezone(): Promise<string> {
  return withConnectionRetry(async () => {
    const settings = await db.query.shopSettings.findFirst({
      columns: { timezone: true },
    });
    return settings?.timezone ?? "Asia/Kolkata";
  });
}
