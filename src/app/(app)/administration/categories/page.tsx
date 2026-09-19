import { CategoriesTab } from "@/components/pages/administration/categories/CategoriesTab";
import { requireSuperadmin } from "@/lib/auth/guard";
import { listCategories } from "@/server/categories/categories-queries";

export const metadata = {
  title: "Categories",
  description: "Manage menu categories.",
};

export default async function Page() {
  // Layout and page render in parallel — this page needs its own guard.
  await requireSuperadmin();

  const categories = await listCategories();
  return <CategoriesTab categories={categories} />;
}
