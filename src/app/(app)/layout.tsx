import { AppNavbar } from "@/components/layout/AppNavbar";
import { OfflineBanner } from "@/components/custom/OfflineBanner";
import { requireUser } from "@/lib/auth/guard";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts has already redirected anonymous requests, but this is the gate
  // that actually enforces it.
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <AppNavbar user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
