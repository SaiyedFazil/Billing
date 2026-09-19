import { ItemsTab } from "@/components/pages/administration/items/ItemsTab";
import { requireSuperadmin } from "@/lib/auth/guard";
import { listCategoryOptions } from "@/server/categories/categories-queries";
import { listItemsForAdmin } from "@/server/items/items-queries";

export const metadata = {
  title: "Items",
  description: "Manage the menu.",
};

export default async function Page() {
  // The layout gate is NOT enough: Next renders layout and page in parallel,
  // so without this the page would fetch and stream item data before the
  // layout's guard threw. See spec §7.2.
  await requireSuperadmin();

  const [items, categories] = await Promise.all([
    listItemsForAdmin(),
    listCategoryOptions(),
  ]);

  return <ItemsTab items={items} categories={categories} />;
}
