import { Suspense } from "react";

import { OfflineBanner } from "@/components/custom/OfflineBanner";
import { PageLoader } from "@/components/custom/PageLoader";
import { AppShell } from "@/components/layout/AppShell";
import { requireUser, type SessionUser } from "@/lib/auth/guard";
import { getShopName } from "@/server/settings/settings-queries";

const FALLBACK_SHOP_NAME = "Billing";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy.ts has already redirected anonymous requests, but this is the gate
  // that actually enforces it. It reads only the session cookie — no database
  // — so it does not hold the response back.
  const user = await requireUser();

  // The shop name needs a database read. Awaiting it here would keep the whole
  // screen blank until the database answers (after sign-in, or on a reload),
  // so the shell is sent straight away with a placeholder name and the real
  // one replaces it when it arrives.
  return (
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <Suspense
        fallback={
          <AppShell user={user} shopName={FALLBACK_SHOP_NAME}>
            <PageLoader />
          </AppShell>
        }
      >
        <ShellWithShopName user={user}>{children}</ShellWithShopName>
      </Suspense>
    </div>
  );
}

async function ShellWithShopName({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const shopName = await getShopName();

  return (
    <AppShell user={user} shopName={shopName}>
      {children}
    </AppShell>
  );
}
