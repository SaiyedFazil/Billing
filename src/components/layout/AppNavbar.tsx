"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Container } from "@/components/layout/Container";
import { UserMenu } from "@/components/layout/UserMenu";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { cn } from "@/lib/utils";

const BASE_LINKS = [
  { href: "/bill", label: "New Bill" },
  { href: REPORT_ROUTES.dashboard, label: "Dashboard" },
  { href: REPORT_ROUTES.bills, label: "Bills" },
  { href: REPORT_ROUTES.sales, label: "Sales" },
  { href: REPORT_ROUTES.items, label: "What's selling" },
];

const OWNER_LINKS = [
  { href: ADMIN_ROUTES.items, label: "Items" },
  { href: ADMIN_ROUTES.categories, label: "Categories" },
  { href: ADMIN_ROUTES.users, label: "Accounts" },
  { href: ADMIN_ROUTES.settings, label: "Settings" },
  { href: ADMIN_ROUTES.audit, label: "Audit" },
];

export function AppNavbar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const links =
    user.role === "SUPERADMIN" ? [...BASE_LINKS, ...OWNER_LINKS] : BASE_LINKS;

  return (
    <header className="bg-background sticky top-0 z-40 border-b">
      <Container className="flex h-14 items-center justify-between gap-4">
        <nav className="hidden items-center gap-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium",
                pathname === link.href
                  ? "bg-muted text-foreground"
                  : "hover:bg-muted text-muted-foreground",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <Menu className="size-5" />
        </Button>

        <UserMenu name={user.name} role={user.role} />
      </Container>

      {mobileOpen ? (
        <nav className="border-t lg:hidden">
          <Container className="flex flex-col py-2">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium",
                  pathname === link.href ? "bg-muted" : "",
                )}
                onClick={() => setMobileOpen(false)}
              >
                {link.label}
              </Link>
            ))}
          </Container>
        </nav>
      ) : null}
    </header>
  );
}
