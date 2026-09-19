import {
  Flame,
  LayoutDashboard,
  LayoutGrid,
  type LucideIcon,
  ReceiptText,
  ShieldCheck,
  Store,
  TrendingUp,
  Users,
  UtensilsCrossed,
} from "lucide-react";

import type { Role } from "@/constants/roles";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";

export const NEW_BILL_HREF = "/bill";

export type NavLink = { href: string; label: string; icon: LucideIcon };
export type NavSection = { label: string; links: NavLink[] };

const INSIGHTS: NavSection = {
  label: "Insights",
  links: [
    { href: REPORT_ROUTES.dashboard, label: "Dashboard", icon: LayoutDashboard },
    { href: REPORT_ROUTES.bills, label: "Bills", icon: ReceiptText },
    { href: REPORT_ROUTES.sales, label: "Sales", icon: TrendingUp },
    { href: REPORT_ROUTES.items, label: "What's selling", icon: Flame },
  ],
};

const MANAGE: NavSection = {
  label: "Manage",
  links: [
    { href: ADMIN_ROUTES.items, label: "Items", icon: UtensilsCrossed },
    { href: ADMIN_ROUTES.categories, label: "Categories", icon: LayoutGrid },
    { href: ADMIN_ROUTES.users, label: "Accounts", icon: Users },
    { href: ADMIN_ROUTES.settings, label: "Settings", icon: Store },
    { href: ADMIN_ROUTES.audit, label: "Audit", icon: ShieldCheck },
  ],
};

/** Hiding links is a courtesy only — every admin page guards itself. */
export function navSectionsFor(role: Role): NavSection[] {
  return role === "SUPERADMIN" ? [INSIGHTS, MANAGE] : [INSIGHTS];
}

/** A link is active on its own page and on anything nested under it. */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
