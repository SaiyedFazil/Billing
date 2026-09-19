import { Container } from "@/components/layout/Container";
import { requireSuperadmin } from "@/lib/auth/guard";

/**
 * Every page under /administration is superadmin-only. This gate covers the
 * page render; each action still calls requireSuperadmin() itself, because
 * actions are separately callable endpoints.
 */
export default async function AdministrationLayout({
  children,
}: LayoutProps<"/administration">) {
  await requireSuperadmin();

  return <Container className="py-6">{children}</Container>;
}
