import { notFound } from "next/navigation";

import { ReceiptView } from "@/components/pages/print/ReceiptView";
import { requireUser } from "@/lib/auth/guard";
import { getReceipt } from "@/server/bills/bills-queries";

import "@/components/pages/print/receipt.css";

export const metadata = {
  title: "Receipt",
};

/**
 * Sits OUTSIDE the (app) route group, so it inherits the providers-only root
 * layout and renders with no navbar at all. See spec §13.2.
 */
export default async function Page({ params }: PageProps<"/print/[billId]">) {
  await requireUser();

  const { billId } = await params;
  const receipt = await getReceipt(billId);

  if (!receipt) notFound();

  return <ReceiptView receipt={receipt} />;
}
