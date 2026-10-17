import { ShopSettingsTab } from "@/components/pages/administration/settings/ShopSettingsTab";
import { requireSuperadmin } from "@/lib/auth/guard";
import { getShopSettings } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Shop settings",
  description: "Details printed on every receipt.",
};

export default async function Page() {
  // Layout and page render in parallel — this page needs its own guard.
  await requireSuperadmin();

  const settings = await getShopSettings();

  return (
    <ShopSettingsTab
      initial={{
        shopName: settings.shopName,
        addressLine: settings.addressLine ?? "",
        phone: settings.phone ?? "",
        receiptFooter: settings.receiptFooter ?? "",
        printerWidth: settings.printerWidth,
        timezone: settings.timezone,
      }}
      paymentMethods={settings.paymentMethods}
    />
  );
}
