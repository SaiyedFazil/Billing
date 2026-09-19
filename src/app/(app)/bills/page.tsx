import { Container } from "@/components/layout/Container";
import { BillsTab } from "@/components/pages/bills/BillsTab";
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { requireUser } from "@/lib/auth/guard";
import { resolveReportRange } from "@/lib/utils/report-params";
import { listBills, listCashiers } from "@/server/bills/bills-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Bills",
  description: "Every bill issued.",
};

const PAGE_SIZE = 25;

export default async function Page({ searchParams }: PageProps<"/bills">) {
  await requireUser();

  const params = await searchParams;
  const timeZone = await getShopTimezone();
  const { from, to } = resolveReportRange(params, timeZone, "LAST_30");

  const read = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  const cashierId = read("cashierId");
  const paymentRaw = read("paymentMethod");
  const paymentMethod = PAYMENT_METHODS.includes(paymentRaw as PaymentMethod)
    ? (paymentRaw as PaymentMethod)
    : undefined;
  const billNumberRaw = read("billNumber");
  const billNumber = /^\d+$/.test(billNumberRaw)
    ? Number(billNumberRaw)
    : undefined;
  const page = Math.max(1, Number(read("page")) || 1);

  const [ledger, cashiers] = await Promise.all([
    listBills(
      {
        from,
        to,
        cashierId: cashierId || undefined,
        paymentMethod,
        billNumber,
      },
      page,
      PAGE_SIZE,
    ),
    listCashiers(),
  ]);

  return (
    <Container>
      <BillsTab
        ledger={ledger}
        filters={{
          from,
          to,
          cashierId,
          paymentMethod: paymentMethod ?? "",
          billNumber: billNumberRaw,
        }}
        cashiers={cashiers}
      />
    </Container>
  );
}
