import { Container } from "@/components/layout/Container";
import { requireUser } from "@/lib/auth/guard";

export default async function ReportsLayout({
  children,
}: LayoutProps<"/reports">) {
  await requireUser();
  return <Container className="py-6">{children}</Container>;
}
