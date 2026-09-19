"use client";

import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import { ROLE_LABELS } from "@/constants/roles";
import type { SessionUser } from "@/lib/auth/guard";
import { logoutAction } from "@/lib/auth/logout";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils/initials";

import { BrandMark } from "./BrandMark";
import { isActive, NEW_BILL_HREF, navSectionsFor } from "./navigation";

/**
 * The espresso sidebar. `collapsed` renders the 76px icon rail used on the
 * billing screen, where the menu grid needs every pixel of width.
 */
export function AppSidebar({
  user,
  shopName,
  collapsed,
  onNavigate,
}: {
  user: SessionUser;
  shopName: string;
  collapsed: boolean;
  /** Called on every link click — the mobile drawer uses it to close. */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const sections = navSectionsFor(user.role);
  const billActive = isActive(pathname, NEW_BILL_HREF);

  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-2.5 bg-sidebar pt-5 pb-4 text-sidebar-foreground">
        <Link
          href={REPORT_ROUTES.dashboard}
          aria-label={shopName}
          title={shopName}
          onClick={onNavigate}
        >
          <BrandMark className="size-11" />
        </Link>
        <span aria-hidden className="my-1.5 h-px w-8 bg-white/10" />
        <Link
          href={NEW_BILL_HREF}
          aria-label="New bill"
          title="New bill"
          aria-current={billActive ? "page" : undefined}
          onClick={onNavigate}
          className={cn(
            "flex size-12 items-center justify-center rounded-[14px] transition-colors",
            billActive
              ? "bg-primary text-white shadow-brand"
              : "bg-brand/15 text-[#ff8a65] hover:bg-brand/25",
          )}
        >
          <Plus className="size-5.5" strokeWidth={2.25} />
        </Link>

        <nav
          aria-label="Main"
          className="flex min-h-0 flex-col items-center gap-1.5 overflow-y-auto"
        >
          {sections.map((section, index) => (
            <Fragment key={section.label}>
              {index > 0 ? (
                <span
                  aria-hidden
                  className="my-1.5 h-px w-8 shrink-0 bg-white/10"
                />
              ) : null}
              {section.links.map((link) => {
                const Icon = link.icon;
                const active = isActive(pathname, link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-label={link.label}
                    title={link.label}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={cn(
                      "flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-primary"
                        : "text-sidebar-muted hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <Icon className="size-5" />
                  </Link>
                );
              })}
            </Fragment>
          ))}
        </nav>

        <span className="flex-1" />
        <span
          title={`${user.name} · ${ROLE_LABELS[user.role]}`}
          className="flex size-10 items-center justify-center rounded-full bg-[#3a2c24] text-[13px] font-semibold text-[#ffb79e]"
        >
          {initials(user.name)}
        </span>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="flex size-10 cursor-pointer items-center justify-center rounded-xl text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4.5" />
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-5 bg-sidebar px-4 pt-5 pb-4 text-sidebar-foreground">
      <Link
        href={REPORT_ROUTES.dashboard}
        onClick={onNavigate}
        className="flex items-center gap-3 px-1.5"
      >
        <BrandMark />
        <span className="min-w-0">
          <span className="block truncate font-heading text-base leading-tight font-bold text-white">
            {shopName}
          </span>
          <span className="block text-xs text-sidebar-muted">
            Counter billing
          </span>
        </span>
      </Link>

      <Link
        href={NEW_BILL_HREF}
        aria-current={billActive ? "page" : undefined}
        onClick={onNavigate}
        className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-semibold text-white shadow-brand transition-colors hover:bg-primary-hover"
      >
        <Plus className="size-4.5" strokeWidth={2.25} />
        New bill
      </Link>

      <nav
        aria-label="Main"
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-1"
      >
        {sections.map((section) => (
          <div key={section.label} className="space-y-0.5">
            <p className="px-3 pb-2 text-[11px] font-semibold tracking-widest text-sidebar-muted uppercase">
              {section.label}
            </p>
            {section.links.map((link) => {
              const Icon = link.icon;
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group flex h-10 items-center gap-3 rounded-[10px] px-3 text-sm transition-colors",
                    active
                      ? "bg-sidebar-accent font-semibold text-white"
                      : "font-medium hover:bg-white/5 hover:text-white",
                  )}
                >
                  <Icon
                    className={cn(
                      "size-4.5",
                      active
                        ? "text-sidebar-primary"
                        : "text-sidebar-muted group-hover:text-sidebar-foreground",
                    )}
                  />
                  {link.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 rounded-2xl border border-sidebar-border bg-white/5 p-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#3a2c24] text-[13px] font-semibold text-[#ffb79e]">
          {initials(user.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">
            {user.name}
          </p>
          <p className="text-xs text-sidebar-muted">{ROLE_LABELS[user.role]}</p>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            aria-label="Sign out"
            title="Sign out"
            className="flex size-9 cursor-pointer items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
