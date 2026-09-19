import { AppShell } from "@/components/layout/AppShell";
import { OfflineBanner } from "@/components/custom/OfflineBanner";
import { requireUser } from "@/lib/auth/guard";
import { getShopName } from "@/server/settings/settings-queries";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts has already redirected anonymous requests, but this is the gate
  // that actually enforces it.
  const user = await requireUser();
  const shopName = await getShopName();

  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <AppShell user={user} shopName={shopName}>
        {children}
      </AppShell>
    </div>
  );
}
