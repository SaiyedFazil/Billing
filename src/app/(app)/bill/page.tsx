import { BillPage } from "@/components/pages/bill/BillPage";
import { requireUser } from "@/lib/auth/guard";
import { getMenu } from "@/server/items/items-queries";
import { getEnabledPaymentMethods } from "@/server/settings/settings-queries";

export const metadata = {
  title: "New Bill",
  description: "Ring up a customer and print a receipt.",
};

export default async function Page() {
  await requireUser();

  // Fetched server-side once per load and passed down — no client fetching,
  // no loading spinner on the till.
  const [menu, paymentMethods] = await Promise.all([
    getMenu(),
    getEnabledPaymentMethods(),
  ]);

  return <BillPage menu={menu} paymentMethods={paymentMethods} />;
}
