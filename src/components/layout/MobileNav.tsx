"use client";

import { Menu, Plus, X } from "lucide-react";
import Link from "next/link";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import type { SessionUser } from "@/lib/auth/guard";

import { AppSidebar } from "./AppSidebar";
import { BrandMark } from "./BrandMark";
import { NEW_BILL_HREF } from "./navigation";

/** Below `lg`: a slim espresso top bar whose menu button opens the sidebar as a drawer. */
export function MobileNav({
  user,
  shopName,
}: {
  user: SessionUser;
  shopName: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-sidebar sticky top-0 z-40 flex h-14 items-center gap-3 px-3 text-white lg:hidden">
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className="flex size-10 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-white/10"
          >
            <Menu className="size-5" />
          </button>
        </DialogPrimitive.Trigger>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="bg-sidebar/50 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-2xl outline-none lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <AppSidebar
              user={user}
              shopName={shopName}
              collapsed={false}
              onNavigate={() => setOpen(false)}
            />
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close menu"
                className="text-sidebar-muted absolute top-5 right-3 flex size-9 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-5" />
              </button>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <span className="flex min-w-0 flex-1 items-center gap-2.5">
        <BrandMark className="size-8 rounded-[10px]" />
        <span className="font-heading truncate text-[15px] font-bold">
          {shopName}
        </span>
      </span>

      <Link
        href={NEW_BILL_HREF}
        className="bg-primary shadow-brand flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold"
      >
        <Plus className="size-4" strokeWidth={2.5} />
        New bill
      </Link>
    </header>
  );
}
