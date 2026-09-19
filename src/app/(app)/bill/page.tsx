import { BillPage } from "@/components/pages/bill/BillPage";
import { requireUser } from "@/lib/auth/guard";
import { getMenu } from "@/server/items/items-queries";

export const metadata = {
  title: "New Bill",
  description: "Ring up a customer and print a receipt.",
};

export default async function Page() {
  await requireUser();

  // Fetched server-side once per load and passed down — no client fetching,
  // no loading spinner on the till.
  const menu = await getMenu();

  return <BillPage menu={menu} />;
}
