"use client";

import { usePathname } from "next/navigation";

import { PageLoader } from "@/components/custom/PageLoader";
import { usePendingNavigation } from "@/hooks/use-pending-navigation";
import type { SessionUser } from "@/lib/auth/guard";
import { cn } from "@/lib/utils";

import { AppSidebar } from "./AppSidebar";
import { MobileNav } from "./MobileNav";
import { NEW_BILL_HREF } from "./navigation";

export function AppShell({
  user,
  shopName,
  children,
}: {
  user: SessionUser;
  shopName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // The till needs width for the menu grid and the cart side by side.
  const collapsed = pathname === NEW_BILL_HREF;
  const navigating = usePendingNavigation();

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 lg:block",
          collapsed ? "w-19" : "w-64",
        )}
      >
        <AppSidebar user={user} shopName={shopName} collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} shopName={shopName} />
        <main className="flex-1">
          {navigating ? <PageLoader /> : null}
          {/* Hidden rather than unmounted: if the click goes nowhere, the
              page comes back as it was (a till cart included). */}
          <div className={navigating ? "hidden" : "contents"}>{children}</div>
        </main>
      </div>
    </div>
  );
}
