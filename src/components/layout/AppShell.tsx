"use client";

import { usePathname } from "next/navigation";

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

  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 lg:block",
          collapsed ? "w-[76px]" : "w-64",
        )}
      >
        <AppSidebar user={user} shopName={shopName} collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav user={user} shopName={shopName} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
