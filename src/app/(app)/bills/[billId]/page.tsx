import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/Container";
import { BillDetails } from "@/components/pages/bills/bill-details/BillDetails";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getReceipt } from "@/server/bills/bills-queries";

export const metadata = {
  title: "Bill",
  description: "A single bill in full.",
};

export default async function Page({ params }: PageProps<"/bills/[billId]">) {
  await requireUser();

  const { billId } = await params;

  const [receipt, statusRow] = await Promise.all([
    getReceipt(billId),
    db.query.bills.findFirst({
      where: eq(bills.id, billId),
      columns: { status: true },
    }),
  ]);

  if (!receipt || !statusRow) notFound();

  return (
    <Container>
      <BillDetails billId={billId} receipt={receipt} status={statusRow.status} />
    </Container>
  );
}
