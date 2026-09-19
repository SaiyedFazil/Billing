# Fast Food Billing — Admin, Reports & Handover Plan (M4–M7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner everything the cashier already has a till for — a menu they can edit, statistics that answer "what is selling", an auditor-proof ledger of every bill, and account control — then hand the whole thing over.

**Architecture:** Same Next.js 16 monolith as Plan 1. Superadmin surfaces live under `/administration` behind a layout-level `requireSuperadmin()` gate; reports read `bill_items` snapshot columns only. Item photos upload direct from the browser to ImageKit via a short-lived signed token, never through a Netlify function.

**Tech Stack:** Next.js 16 · TypeScript strict · Tailwind v4 · shadcn/ui (radix-nova) · Drizzle · Neon · Auth.js v5 · Zod 4 · Recharts · ImageKit

**Spec:** `docs/superpowers/specs/2026-08-23-fastfood-billing-design.md`
**Builds on:** `docs/superpowers/plans/2026-08-26-fastfood-billing-core.md` (M0–M3, complete and verified)

**Covers:** M4 (item & category management), M5 (reports), M6 (users, settings, audit), M7 (polish and handover).

---

## Global Constraints

Every task's requirements implicitly include this section. These are the same rules Plan 1 ran under, plus what M0–M3 actually established.

1. **Money is RUPEES as an exact decimal string** — `"60.50"`, never a JavaScript number. Postgres columns are `numeric(10,2)`; all arithmetic goes through `src/lib/utils/money.ts` (big.js). Floats fail the `bills_total_matches` CHECK constraint outright, so a bill with a float total cannot be saved at all.
   - **Never compare amounts with `<`, `>`, `===`** — use `compare()`. `"60.5"` and `"60.50"` are equal amounts but unequal strings.
   - **SQL aggregates over `numeric` return strings.** Cast with `::text`, type them `sql<string>`, and never `::int` — that truncates to whole rupees.
   - **Money crosses the wire as a string.** A JSON number is an IEEE-754 double.
2. **No test framework.** Verification is manual, by running the exact commands each task specifies. Extend the existing `scripts/verify-*.ts` pattern rather than adding Vitest.
3. **No git.** Do not run `git init`, `git add`, or `git commit`.
4. **Every server action begins with a guard** — `requireUser()` or `requireSuperadmin()` on the first line, inside `guarded()`. `proxy.ts` only redirects.
5. **Reports read `bill_items` snapshot columns** (`itemName`, `categoryName`, `unitPrice`). **Never join to `items`** for a name or price.
6. **Never `DELETE` an item, category or user.** Set `is_active = false`.
7. **Every superadmin mutation writes `audit_log`** via `writeAuditLog`, with `before`/`after` JSON.
8. **Inside `db.transaction`, only throw.** Returning from the callback commits.
9. **Reads that run on page load wrap in `withConnectionRetry`.** Never wrap a transaction.
10. **Naming:** components `PascalCase.tsx` · feature hooks `useThingTab.ts` · global hooks `use-thing.ts` · `lib`/`server`/`db` files `kebab-case.ts` · types `<domain>.types.ts`.
11. **Path alias `@/*` → `src/*`.** TypeScript `strict: true`.

### Version facts that will bite you

These are established, not guesses — they came out of building M0–M3.

| Fact                     | Consequence                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 16.3.3**       | Middleware is `src/proxy.ts`. Page props are `PageProps<"/route">`, layouts `LayoutProps<"/route">`. `params` and `searchParams` are **Promises** — `await` them.                   |
| **Tailwind v4**          | No `tailwind.config.ts`. Theme tokens live in `src/app/globals.css`.                                                                                                                |
| **Zod 4**                | Use `z.uuid()`, `z.email()` — not the deprecated `z.string().uuid()`. `error.issues` is still correct.                                                                              |
| **Auth.js v5 beta**      | JWT augmentation must target `@auth/core/jwt` as well as `next-auth/jwt`. Already done in `src/types/next-auth.d.ts`.                                                               |
| **`db` is a lazy Proxy** | It connects on first property access. Do not add a top-level `DATABASE_URL` check to any module.                                                                                    |
| **drizzle-orm 0.45.2**   | `check()` is available from `drizzle-orm/pg-core`. Table callbacks return an **array**, not an object.                                                                              |
| **Migration chain**      | `0001_immutability_triggers.sql` is hand-written with a matching `meta/0001_snapshot.json`. If you add a migration, `db:generate` produces `0002_*`. Never delete either 0001 file. |

### What already exists

Do not rebuild these. Import them.

```ts
// Auth & results
import {
  guarded,
  requireUser,
  requireSuperadmin,
  type SessionUser,
} from "@/lib/auth/guard";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

// Money & dates
import {
  parseRupees,
  formatINR,
  formatReceiptAmount,
  lineTotal,
  billTotal,
} from "@/lib/utils/money";
import {
  businessDate,
  formatBillDate,
  formatBillTime,
} from "@/lib/utils/dates";

// Data
import { db } from "@/db";
import { withConnectionRetry } from "@/db/with-connection-retry";
import {
  users,
  categories,
  items,
  bills,
  billItems,
  billCounters,
  auditLog,
  shopSettings,
} from "@/db/schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";
import {
  getShopSettings,
  getShopTimezone,
} from "@/server/settings/settings-queries";
import { getMenu } from "@/server/items/items-queries";

// Constants
import { ROLES, ROLE_LABELS, type Role } from "@/constants/roles";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  collectsTender,
  type PaymentMethod,
} from "@/constants/payment-methods";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";

// UI
import { MoneyInput } from "@/components/custom/MoneyInput";
import { Container } from "@/components/layout/Container";
```

shadcn components already installed: `alert badge button card dialog dropdown-menu input label scroll-area separator skeleton sonner table tabs`.

---

## File Structure

**Shared primitives (Task 1)**

- `src/components/custom/ConfirmDialog.tsx` — one destructive-confirmation dialog, used by every delete/deactivate flow
- `src/components/custom/TableEmptyState.tsx`, `TableErrorState.tsx`
- `src/hooks/use-debounce.ts`, `use-url-pagination.ts`
- `src/lib/routes/administration-routes.ts`, `report-routes.ts`
- `src/app/(app)/administration/layout.tsx` — the `requireSuperadmin()` gate for every admin page

**Categories (Tasks 2–3)** · **ImageKit (Task 4)** · **Items (Tasks 5–6)**

- `src/server/categories/{categories-queries,categories-actions}.ts`
- `src/lib/storage/{index,imagekit}.ts` — the swappable adapter from spec §4.5
- `src/server/items/items-actions.ts` (new), `items-queries.ts` (extended)
- `src/components/pages/administration/{categories,items}/…`

**Reports (Tasks 7–14)**

- `src/lib/utils/csv.ts`, `src/lib/utils/date-range.ts`
- `src/server/reports/reports-queries.ts` — all aggregation, all in SQL
- `src/server/bills/bills-queries.ts` (extended: ledger + detail)
- `src/components/pages/{dashboard,bills,reports}/…`

**Users, settings, audit (Tasks 15–19)**

- `src/server/users/{users-queries,users-actions}.ts`
- `src/server/settings/settings-actions.ts`
- `src/server/audit/audit-queries.ts`
- `src/components/pages/administration/{users,settings,audit}/…`

**Handover (Tasks 20–21)**

- `src/components/layout/AppNavbar.tsx` (extended: role-aware links)
- `scripts/reset-bills.ts`, `scripts/seed-real-menu.ts`

---

# M4 — Item & Category Management

### Task 1: Admin shell and shared primitives

**Files:**

- Create: `src/app/(app)/administration/layout.tsx`
- Create: `src/components/custom/ConfirmDialog.tsx`, `TableEmptyState.tsx`, `TableErrorState.tsx`
- Create: `src/hooks/use-debounce.ts`, `src/hooks/use-url-pagination.ts`
- Create: `src/lib/routes/administration-routes.ts`, `src/lib/routes/report-routes.ts`

**Interfaces:**

- Consumes: `requireSuperadmin`, `Container`
- Produces:
  - `<ConfirmDialog open onOpenChange title description confirmLabel onConfirm isPending variant />`
  - `<TableEmptyState title description action? />`, `<TableErrorState message onRetry? />`
  - `useDebounce<T>(value: T, delayMs?: number): T`
  - `useUrlPagination(): { page: number; pageSize: number; setPage(n): void; setPageSize(n): void }`
  - `ADMIN_ROUTES`, `REPORT_ROUTES` — route constant objects

- [ ] **Step 1: Add the shadcn components this plan needs**

```bash
npx shadcn@latest add alert-dialog select switch textarea popover calendar chart --yes
npm install recharts
```

`calendar` pulls in `react-day-picker`; `chart` is the shadcn wrapper around Recharts.

- [ ] **Step 2: Create the route constants**

`src/lib/routes/administration-routes.ts`:

```ts
export const ADMIN_ROUTES = {
  items: "/administration/items",
  categories: "/administration/categories",
  users: "/administration/users",
  settings: "/administration/settings",
  audit: "/administration/audit",
} as const;
```

`src/lib/routes/report-routes.ts`:

```ts
export const REPORT_ROUTES = {
  dashboard: "/dashboard",
  sales: "/reports/sales",
  items: "/reports/items",
  bills: "/bills",
  bill: (billId: string) => `/bills/${billId}`,
  print: (billId: string) => `/print/${billId}`,
} as const;
```

- [ ] **Step 3: Create the admin layout gate**

`src/app/(app)/administration/layout.tsx`:

```tsx
import { Container } from "@/components/layout/Container";
import { requireSuperadmin } from "@/lib/auth/guard";

/**
 * Every page under /administration is superadmin-only.
 *
 * This is a convenience gate ONLY. Next.js renders layouts and pages in
 * parallel, so a page relying on this alone would still run its queries and
 * stream the data before this error propagates. Every page under
 * /administration must call requireSuperadmin() itself, and so must every
 * action. See spec §7.2.
 */
export default async function AdministrationLayout({
  children,
}: LayoutProps<"/administration">) {
  await requireSuperadmin();

  return <Container className="py-6">{children}</Container>;
}
```

- [ ] **Step 4: Create the confirmation dialog**

`src/components/custom/ConfirmDialog.tsx`:

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  isPending = false,
  destructive = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  isPending?: boolean;
  destructive?: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{description}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(event) => {
              // Keep the dialog open while the action runs so the pending
              // state is visible; the caller closes it on success.
              event.preventDefault();
              onConfirm();
            }}
            className={cn(
              destructive &&
                "text-destructive-foreground bg-destructive hover:bg-destructive/90",
            )}
          >
            {isPending ? "Working…" : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Create the table states**

`src/components/custom/TableEmptyState.tsx`:

```tsx
export function TableEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="font-medium">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
```

`src/components/custom/TableErrorState.tsx`:

```tsx
"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TableErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <AlertCircle className="size-6 text-destructive" />
      <p className="max-w-sm text-sm text-destructive">{message}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 6: Create the global hooks**

`src/hooks/use-debounce.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
```

`src/hooks/use-url-pagination.ts`:

```ts
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export const DEFAULT_PAGE_SIZE = 25;

/**
 * Pagination state lives in the URL so a page of the bills ledger can be
 * bookmarked and shared — which matters when the accountant asks for
 * "that screen you showed me".
 */
export function useUrlPagination() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.max(
    1,
    Number(searchParams.get("pageSize") ?? DEFAULT_PAGE_SIZE) ||
      DEFAULT_PAGE_SIZE,
  );

  const push = useCallback(
    (next: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) params.set(key, value);
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const setPage = useCallback(
    (next: number) => push({ page: String(next) }),
    [push],
  );

  const setPageSize = useCallback(
    (next: number) => push({ pageSize: String(next), page: "1" }),
    [push],
  );

  return { page, pageSize, setPage, setPageSize };
}
```

- [ ] **Step 7: Create a placeholder admin page so the gate can be tested**

`src/app/(app)/administration/items/page.tsx`:

```tsx
export const metadata = { title: "Items" };

export default function Page() {
  return <p className="text-muted-foreground">Items — built in Task 6.</p>;
}
```

- [ ] **Step 8: Verify the gate rejects a non-superadmin**

```bash
npm run dev
```

Create a second, ADMIN-role user directly so you have something to test with:

```bash
npx tsx --env-file=.env.local -e "
import { db } from './src/db';
import { users } from './src/db/schema';
import { hashPassword } from './src/lib/auth/password';
await db.insert(users).values({
  username: 'cashier', passwordHash: await hashPassword('Cashier@123'),
  name: 'Test Cashier', role: 'ADMIN',
});
console.log('created cashier / Cashier@123');
process.exit(0);
"
```

1. Sign in as `owner` → visit `/administration/items` → expected: the placeholder renders.
2. Sign out, sign in as `cashier` → visit `/administration/items` → expected: **an error page, not the placeholder.** `requireSuperadmin()` throws `GuardError`, which Next renders as an unhandled error in dev.
3. `npx tsc --noEmit` → exit 0.

Task 20 replaces that raw error with a proper 403 page. Leaving it ugly until then is deliberate — a visible failure is better than a silent one.

---

### Task 2: Category queries and actions

**Files:**

- Create: `src/server/categories/categories-queries.ts`, `categories-actions.ts`
- Create: `src/lib/validation/category-schema.ts`
- Create: `src/types/category.types.ts`

**Interfaces:**

- Consumes: `db`, `categories`, `items`, `guarded`, `requireSuperadmin`, `writeAuditLog`, `withConnectionRetry`
- Produces:
  - `listCategories(): Promise<CategoryRow[]>` where `CategoryRow = { id, name, sortOrder, isActive, itemCount }`
  - `createCategoryAction(input): Promise<ActionResult<{ id: string }>>`
  - `updateCategoryAction(input): Promise<ActionResult<null>>`
  - `deleteCategoryAction(input: { id: string }): Promise<ActionResult<null>>`
  - `categorySchema`, `type CategoryInput`

- [ ] **Step 1: Create the types**

`src/types/category.types.ts`:

```ts
export type CategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  /** Active items in this category. Shown so the owner knows what a delete affects. */
  itemCount: number;
};
```

- [ ] **Step 2: Create the validation schema**

`src/lib/validation/category-schema.ts`:

```ts
import { z } from "zod";

export const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(60, "Name must be 60 characters or fewer"),
  sortOrder: z
    .number()
    .int("Sort order must be a whole number")
    .min(0, "Sort order cannot be negative")
    .max(9999, "Sort order is too large"),
});

export const updateCategorySchema = categorySchema.extend({
  id: z.uuid(),
});

export type CategoryInput = z.infer<typeof categorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
```

- [ ] **Step 3: Create the queries**

`src/server/categories/categories-queries.ts`:

```ts
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type { CategoryRow } from "@/types/category.types";

/** Active categories with a count of their active items. */
export async function listCategories(): Promise<CategoryRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        id: categories.id,
        name: categories.name,
        sortOrder: categories.sortOrder,
        isActive: categories.isActive,
        itemCount: sql<number>`
          (SELECT count(*)::int FROM ${items}
           WHERE ${items.categoryId} = ${categories.id} AND ${items.isActive})
        `,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  );
}

/** Minimal list for the item form's category picker. */
export async function listCategoryOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  return withConnectionRetry(async () =>
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(asc(categories.sortOrder), asc(categories.name)),
  );
}

export async function countActiveItemsInCategory(
  categoryId: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(items)
    .where(and(eq(items.categoryId, categoryId), eq(items.isActive, true)));
  return row?.n ?? 0;
}
```

- [ ] **Step 4: Create the actions**

`src/server/categories/categories-actions.ts`:

```ts
"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import {
  categorySchema,
  updateCategorySchema,
} from "@/lib/validation/category-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";
import { countActiveItemsInCategory } from "@/server/categories/categories-queries";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[issue.path.join(".")] = issue.message;
  return fields;
}

/** Case-insensitive duplicate check among ACTIVE categories only. */
async function nameIsTaken(name: string, exceptId?: string): Promise<boolean> {
  const conditions = [
    sql`lower(${categories.name}) = lower(${name})`,
    eq(categories.isActive, true),
  ];
  if (exceptId) conditions.push(ne(categories.id, exceptId));

  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(...conditions))
    .limit(1);

  return Boolean(row);
}

export async function createCategoryAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = categorySchema.safeParse(payload);
    if (!parsed.success) {
      return fail<{ id: string }>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error.issues),
      );
    }

    if (await nameIsTaken(parsed.data.name)) {
      return fail<{ id: string }>(
        "CONFLICT",
        "A category with that name already exists.",
        {
          name: "Already in use",
        },
      );
    }

    const [created] = await db
      .insert(categories)
      .values({ name: parsed.data.name, sortOrder: parsed.data.sortOrder })
      .returning({ id: categories.id });

    await writeAuditLog({
      actorId: user.id,
      action: "CATEGORY_CREATED",
      entityType: "category",
      entityId: created.id,
      after: parsed.data,
    });

    revalidatePath(ADMIN_ROUTES.categories);
    return ok(created);
  });
}

export async function updateCategoryAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = updateCategorySchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error.issues),
      );
    }

    const { id, ...values } = parsed.data;

    const before = await db.query.categories.findFirst({
      where: eq(categories.id, id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That category no longer exists.");
    }

    if (await nameIsTaken(values.name, id)) {
      return fail<null>(
        "CONFLICT",
        "A category with that name already exists.",
        {
          name: "Already in use",
        },
      );
    }

    await db
      .update(categories)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(categories.id, id));

    await writeAuditLog({
      actorId: user.id,
      action: "CATEGORY_UPDATED",
      entityType: "category",
      entityId: id,
      before: { name: before.name, sortOrder: before.sortOrder },
      after: values,
    });

    revalidatePath(ADMIN_ROUTES.categories);
    return ok(null);
  });
}

export async function deleteCategoryAction(payload: {
  id: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const before = await db.query.categories.findFirst({
      where: eq(categories.id, payload.id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That category no longer exists.");
    }

    // Refuse rather than cascade: silently retiring a category's items would
    // pull them off the till with no warning.
    const itemCount = await countActiveItemsInCategory(payload.id);
    if (itemCount > 0) {
      return fail<null>(
        "CONFLICT",
        `“${before.name}” still has ${itemCount} item${itemCount === 1 ? "" : "s"}. ` +
          "Move or remove them first.",
      );
    }

    // Soft delete. Past bills keep their category-name snapshot.
    await db
      .update(categories)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(categories.id, payload.id));

    await writeAuditLog({
      actorId: user.id,
      action: "CATEGORY_DELETED",
      entityType: "category",
      entityId: payload.id,
      before: { name: before.name, sortOrder: before.sortOrder },
    });

    revalidatePath(ADMIN_ROUTES.categories);
    return ok(null);
  });
}
```

- [ ] **Step 5: Verify the actions behave**

Create `scripts/verify-categories.ts`:

```ts
import { and, eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import { categories } from "../src/db/schema";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  // Soft delete must hide the row from the active unique index, so the same
  // name can be reused afterwards.
  await db.execute(
    sql`DELETE FROM categories WHERE name = 'Soft Delete Probe'`,
  );

  const [created] = await db
    .insert(categories)
    .values({ name: "Soft Delete Probe", sortOrder: 99 })
    .returning({ id: categories.id });

  await db
    .update(categories)
    .set({ isActive: false })
    .where(eq(categories.id, created.id));

  const [reused] = await db
    .insert(categories)
    .values({ name: "Soft Delete Probe", sortOrder: 99 })
    .returning({ id: categories.id });

  check("a retired category's name can be reused", Boolean(reused?.id));

  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(
      and(
        sql`lower(${categories.name}) = 'soft delete probe'`,
        eq(categories.isActive, true),
      ),
    );
  check("only one ACTIVE row holds that name", rows.length === 1, rows);

  await db.execute(
    sql`DELETE FROM categories WHERE name = 'Soft Delete Probe'`,
  );

  console.log(
    failures === 0
      ? "\nAll category checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json` scripts: `"verify:categories": "tsx --env-file=.env.local scripts/verify-categories.ts"`

```bash
npm run verify:categories
```

Expected: two `PASS` lines. This proves the partial unique index from M1 does what it was designed for — a retired category does not block reusing its name.

---

### Task 3: Category management UI

**Files:**

- Create: `src/components/pages/administration/categories/CategoriesTab.tsx`, `CategoriesColumns.tsx`
- Create: `src/components/pages/administration/categories/create-update-category-dialog/CreateUpdateCategoryDialog.tsx`
- Create: `src/components/pages/administration/categories/hooks/useCategoriesTab.ts`
- Modify: `src/app/(app)/administration/categories/page.tsx` (create)

**Interfaces:**

- Consumes: `listCategories`, the three category actions, `ConfirmDialog`, `TableEmptyState`
- Produces: a working `/administration/categories` route

- [ ] **Step 1: Create the container hook**

`src/components/pages/administration/categories/hooks/useCategoriesTab.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/server/categories/categories-actions";
import type { CategoryRow } from "@/types/category.types";

export type CategoryFormState = {
  id: string | null;
  name: string;
  sortOrder: string;
};

const EMPTY_FORM: CategoryFormState = { id: null, name: "", sortOrder: "0" };

export function useCategoriesTab() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<CategoryRow | null>(null);

  const openCreate = useCallback(() => {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((row: CategoryRow) => {
    setForm({ id: row.id, name: row.name, sortOrder: String(row.sortOrder) });
    setFieldErrors({});
    setDialogOpen(true);
  }, []);

  const submit = useCallback(() => {
    setFieldErrors({});

    startTransition(async () => {
      const payload = {
        name: form.name,
        sortOrder: Number(form.sortOrder) || 0,
      };

      const result = form.id
        ? await updateCategoryAction({ ...payload, id: form.id })
        : await createCategoryAction(payload);

      if (result.ok) {
        toast.success(form.id ? "Category updated" : "Category created");
        setDialogOpen(false);
        router.refresh();
        return;
      }

      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const target = pendingDelete;

    startTransition(async () => {
      const result = await deleteCategoryAction({ id: target.id });
      if (result.ok) {
        toast.success(`“${target.name}” removed`);
        setPendingDelete(null);
        router.refresh();
        return;
      }
      toast.error(result.error.message);
      setPendingDelete(null);
    });
  }, [pendingDelete, router]);

  return {
    isPending,
    dialogOpen,
    setDialogOpen,
    form,
    setForm,
    fieldErrors,
    openCreate,
    openEdit,
    submit,
    pendingDelete,
    setPendingDelete,
    confirmDelete,
  };
}
```

- [ ] **Step 2: Create the columns**

`src/components/pages/administration/categories/CategoriesColumns.tsx`:

```tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { CategoryRow } from "@/types/category.types";

export const CATEGORY_HEADERS = ["Name", "Order", "Items", ""] as const;

export function CategoryTableRow({
  row,
  onEdit,
  onDelete,
  disabled,
}: {
  row: CategoryRow;
  onEdit: (row: CategoryRow) => void;
  onDelete: (row: CategoryRow) => void;
  disabled: boolean;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell className="tabular-nums">{row.sortOrder}</TableCell>
      <TableCell className="tabular-nums">{row.itemCount}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Edit ${row.name}`}
          onClick={() => onEdit(row)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Remove ${row.name}`}
          onClick={() => onDelete(row)}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 3: Create the dialog**

`src/components/pages/administration/categories/create-update-category-dialog/CreateUpdateCategoryDialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import type { CategoryFormState } from "../hooks/useCategoriesTab";

export function CreateUpdateCategoryDialog({
  open,
  onOpenChange,
  form,
  setForm,
  fieldErrors,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CategoryFormState;
  setForm: (next: CategoryFormState) => void;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {form.id ? "Edit category" : "New category"}
          </DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="category-name">Name</Label>
            <Input
              id="category-name"
              value={form.name}
              autoFocus
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            {fieldErrors.name ? (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="category-sort">Display order</Label>
            <Input
              id="category-sort"
              inputMode="numeric"
              value={form.sortOrder}
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.sortOrder)}
              onChange={(event) => {
                const next = event.target.value;
                if (next === "" || /^\d{0,4}$/.test(next)) {
                  setForm({ ...form, sortOrder: next });
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Lower numbers appear first on the billing screen.
            </p>
            {fieldErrors.sortOrder ? (
              <p className="text-sm text-destructive">
                {fieldErrors.sortOrder}
              </p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create the tab**

`src/components/pages/administration/categories/CategoriesTab.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CategoryRow } from "@/types/category.types";

import { CATEGORY_HEADERS, CategoryTableRow } from "./CategoriesColumns";
import { CreateUpdateCategoryDialog } from "./create-update-category-dialog/CreateUpdateCategoryDialog";
import { useCategoriesTab } from "./hooks/useCategoriesTab";

export function CategoriesTab({ categories }: { categories: CategoryRow[] }) {
  const tab = useCategoriesTab();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="text-sm text-muted-foreground">
            Groups the billing screen uses for its tabs.
          </p>
        </div>
        <Button onClick={tab.openCreate}>
          <Plus className="size-4" />
          New category
        </Button>
      </div>

      {categories.length === 0 ? (
        <TableEmptyState
          title="No categories yet"
          description="Add a category before adding items — every item belongs to one."
          action={<Button onClick={tab.openCreate}>New category</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {CATEGORY_HEADERS.map((header, index) => (
                <TableHead
                  key={header || `actions-${index}`}
                  className={
                    index === CATEGORY_HEADERS.length - 1 ? "text-right" : ""
                  }
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((row) => (
              <CategoryTableRow
                key={row.id}
                row={row}
                onEdit={tab.openEdit}
                onDelete={tab.setPendingDelete}
                disabled={tab.isPending}
              />
            ))}
          </TableBody>
        </Table>
      )}

      <CreateUpdateCategoryDialog
        open={tab.dialogOpen}
        onOpenChange={tab.setDialogOpen}
        form={tab.form}
        setForm={tab.setForm}
        fieldErrors={tab.fieldErrors}
        onSubmit={tab.submit}
        isPending={tab.isPending}
      />

      <ConfirmDialog
        open={tab.pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) tab.setPendingDelete(null);
        }}
        title={`Remove “${tab.pendingDelete?.name}”?`}
        description="It disappears from the billing screen. Past bills keep this category name, so reports are unaffected."
        confirmLabel="Remove"
        destructive
        isPending={tab.isPending}
        onConfirm={tab.confirmDelete}
      />
    </div>
  );
}
```

- [ ] **Step 5: Create the route**

`src/app/(app)/administration/categories/page.tsx`:

```tsx
import { CategoriesTab } from "@/components/pages/administration/categories/CategoriesTab";
import { listCategories } from "@/server/categories/categories-queries";

export const metadata = {
  title: "Categories",
  description: "Manage menu categories.",
};

export default async function Page() {
  const categories = await listCategories();
  return <CategoriesTab categories={categories} />;
}
```

The layout gate already ran `requireSuperadmin()`, and each action re-checks.

- [ ] **Step 6: Verify the category flow**

```bash
npm run dev
```

Signed in as `owner`, at `/administration/categories`:

1. Three seeded categories listed with item counts of 3 each.
2. **New category** → name "Desserts", order 4 → saves, appears in the table.
3. Open `/bill` → expected: a **Desserts** tab appears (empty).
4. Back at categories, **edit** Desserts → rename to "Sweets" → saves.
5. **Remove** Sweets → confirm → disappears.
6. **Remove** Burgers → expected: **refused**, toast reads "Burgers still has 3 items. Move or remove them first."
7. Create a category named "burgers" (lowercase) → expected: refused as a duplicate.
8. Create "Sweets" again → expected: **allowed**, because the retired one no longer occupies the name.

```bash
npx tsc --noEmit && npm run lint
```

---

### Task 4: ImageKit storage adapter

**Files:**

- Create: `src/lib/storage/index.ts`, `src/lib/storage/imagekit.ts`
- Create: `src/server/items/upload-token-action.ts`

**Interfaces:**

- Consumes: `guarded`, `requireSuperadmin`, ImageKit env vars from `.env.local`
- Produces:
  - `getUploadAuth(): { token, expire, signature, publicKey, urlEndpoint }`
  - `deleteFile(fileId: string): Promise<void>`
  - `thumbnailUrl(url: string, size?: number): string`
  - `getUploadTokenAction(): Promise<ActionResult<UploadAuth>>`

- [ ] **Step 1: Create the ImageKit driver**

`src/lib/storage/imagekit.ts`:

```ts
import { createHmac, randomUUID } from "node:crypto";

const UPLOAD_TOKEN_TTL_SECONDS = 10 * 60;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Add your ImageKit credentials to .env.local.`,
    );
  }
  return value;
}

export type UploadAuth = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
};

/**
 * Short-lived credentials the BROWSER uses to upload straight to ImageKit.
 *
 * The file never passes through a Netlify function — a 5 MB upload would burn
 * execution time and can exceed the payload limit. See spec §12.2.
 *
 * ImageKit's scheme: signature = HMAC-SHA1(privateKey, token + expire).
 */
export function getUploadAuth(): UploadAuth {
  const privateKey = requireEnv("IMAGEKIT_PRIVATE_KEY");
  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + UPLOAD_TOKEN_TTL_SECONDS;

  const signature = createHmac("sha1", privateKey)
    .update(token + expire)
    .digest("hex");

  return {
    token,
    expire,
    signature,
    publicKey: requireEnv("IMAGEKIT_PUBLIC_KEY"),
    urlEndpoint: requireEnv("IMAGEKIT_URL_ENDPOINT"),
  };
}

/** Permanently removes a file. Called when replacing or clearing an image. */
export async function deleteFile(fileId: string): Promise<void> {
  const privateKey = requireEnv("IMAGEKIT_PRIVATE_KEY");
  // ImageKit uses HTTP Basic with the private key as the username and an
  // empty password.
  const auth = Buffer.from(`${privateKey}:`).toString("base64");

  const response = await fetch(
    `https://api.imagekit.io/v1/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE", headers: { Authorization: `Basic ${auth}` } },
  );

  // 404 means it is already gone, which is the state we wanted.
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `ImageKit delete failed (${response.status}): ${await response.text()}`,
    );
  }
}

export const UPLOAD_ENDPOINT = "https://upload.imagekit.io/api/v1/files/upload";
```

- [ ] **Step 2: Create the adapter facade**

`src/lib/storage/index.ts`:

```ts
export {
  deleteFile,
  getUploadAuth,
  UPLOAD_ENDPOINT,
  type UploadAuth,
} from "./imagekit";

/**
 * The billing grid loads dozens of images at once, so never serve originals.
 * ImageKit resizes and converts to WebP on the fly: a 4 MB phone photo
 * becomes roughly a 20 KB thumbnail.
 */
export function thumbnailUrl(url: string, size = 300): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}tr=w-${size},h-${size},fo-auto,f-webp`;
}

/** Swap this module's contents to move to Cloudflare R2 or S3. Nothing else changes. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
```

- [ ] **Step 3: Create the token action**

`src/server/items/upload-token-action.ts`:

```ts
"use server";

import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { getUploadAuth, type UploadAuth } from "@/lib/storage";
import { type ActionResult, ok } from "@/lib/utils/result";

/**
 * Only a superadmin can obtain an upload token — otherwise anyone signed in
 * could push files into the shop's ImageKit account.
 */
export async function getUploadTokenAction(): Promise<
  ActionResult<UploadAuth>
> {
  return guarded(async () => {
    await requireSuperadmin();
    return ok(getUploadAuth());
  });
}
```

- [ ] **Step 4: Verify the signature scheme against ImageKit**

Create `scripts/verify-imagekit.ts`:

```ts
import { createHmac } from "node:crypto";

import { getUploadAuth, thumbnailUrl } from "../src/lib/storage";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  const auth = getUploadAuth();

  check("token is a uuid", /^[0-9a-f-]{36}$/.test(auth.token), auth.token);
  check(
    "expire is in the future but within an hour",
    auth.expire > Math.floor(Date.now() / 1000) &&
      auth.expire < Math.floor(Date.now() / 1000) + 3600,
    auth.expire,
  );

  const expected = createHmac("sha1", process.env.IMAGEKIT_PRIVATE_KEY!)
    .update(auth.token + auth.expire)
    .digest("hex");
  check("signature is HMAC-SHA1 of token+expire", auth.signature === expected);

  check(
    "the private key never leaves the server",
    !JSON.stringify(auth).includes(process.env.IMAGEKIT_PRIVATE_KEY!),
  );

  check(
    "thumbnailUrl appends a transformation",
    thumbnailUrl("https://ik.imagekit.io/x/a.jpg") ===
      "https://ik.imagekit.io/x/a.jpg?tr=w-300,h-300,fo-auto,f-webp",
    thumbnailUrl("https://ik.imagekit.io/x/a.jpg"),
  );

  // Live check: ImageKit must accept the credentials.
  const authHeader = Buffer.from(
    `${process.env.IMAGEKIT_PRIVATE_KEY}:`,
  ).toString("base64");
  const response = await fetch("https://api.imagekit.io/v1/files?limit=1", {
    headers: { Authorization: `Basic ${authHeader}` },
  });
  check(
    `ImageKit accepts the private key (HTTP ${response.status})`,
    response.ok,
    await response.text().catch(() => ""),
  );

  console.log(
    failures === 0
      ? "\nAll ImageKit checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`: `"verify:imagekit": "tsx --env-file=.env.local scripts/verify-imagekit.ts"`

- [ ] **Step 5: Run it**

```bash
npm run verify:imagekit
```

Expected: six `PASS` lines. The last one is a real network call — if it returns 401, the ImageKit keys in `.env.local` are wrong.

**The "private key never leaves the server" check is the important one.** If it ever fails, the shop's ImageKit account is compromised the moment the page loads.

---

### Task 5: Item queries and actions

**Files:**

- Create: `src/server/items/items-actions.ts`
- Modify: `src/server/items/items-queries.ts` (append `listItemsForAdmin`)
- Create: `src/lib/validation/item-schema.ts`
- Modify: `src/types/item.types.ts` (append `AdminItemRow`)

**Interfaces:**

- Consumes: `db`, `items`, `categories`, `guarded`, `requireSuperadmin`, `writeAuditLog`, `deleteFile`, `parseRupees`
- Produces:
  - `listItemsForAdmin(): Promise<AdminItemRow[]>`
  - `createItemAction(input): Promise<ActionResult<{ id: string }>>`
  - `updateItemAction(input): Promise<ActionResult<null>>`
  - `deleteItemAction({ id }): Promise<ActionResult<null>>`
  - `toggleItemAvailabilityAction({ id, isAvailable }): Promise<ActionResult<null>>`
  - `itemSchema`, `updateItemSchema`

- [ ] **Step 1: Extend the item types**

Append to `src/types/item.types.ts`:

```ts
export type AdminItemRow = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  /** Rupees, e.g. "60.50". */
  price: string;
  imageUrl: string | null;
  imageFileId: string | null;
  isAvailable: boolean;
  sortOrder: number;
};
```

- [ ] **Step 2: Create the validation schema**

`src/lib/validation/item-schema.ts`:

```ts
import { z } from "zod";

export const itemSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be 80 characters or fewer"),
  categoryId: z.uuid("Choose a category"),
  // Already normalised by the form via parseRupees(). A string, not a number:
  // a JSON number here would be a double and lose exactness in transit.
  price: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Price must be an amount like 60.50")
    .refine(
      (value) => Number(value) <= 100_000,
      "Price is unrealistically high",
    ),
  imageUrl: z.url("Invalid image URL").nullable(),
  imageFileId: z.string().min(1).nullable(),
  isAvailable: z.boolean(),
  sortOrder: z.number().int().min(0).max(9999),
});

export const updateItemSchema = itemSchema.extend({ id: z.uuid() });

export type ItemInput = z.infer<typeof itemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
```

- [ ] **Step 3: Add the admin listing query**

Append to `src/server/items/items-queries.ts`:

```ts
import type { AdminItemRow } from "@/types/item.types";

/**
 * Every active item with its category name, for the management table.
 * Unlike getMenu() this is flat — the admin table is not grouped.
 */
export async function listItemsForAdmin(): Promise<AdminItemRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        id: items.id,
        name: items.name,
        categoryId: items.categoryId,
        categoryName: categories.name,
        price: items.price,
        imageUrl: items.imageUrl,
        imageFileId: items.imageFileId,
        isAvailable: items.isAvailable,
        sortOrder: items.sortOrder,
      })
      .from(items)
      .innerJoin(categories, eq(items.categoryId, categories.id))
      .where(eq(items.isActive, true))
      .orderBy(
        asc(categories.sortOrder),
        asc(categories.name),
        asc(items.sortOrder),
        asc(items.name),
      ),
  );
}
```

- [ ] **Step 4: Create the item actions**

`src/server/items/items-actions.ts`:

```ts
"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { categories, items } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { deleteFile } from "@/lib/storage";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { itemSchema, updateItemSchema } from "@/lib/validation/item-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[issue.path.join(".")] = issue.message;
  return fields;
}

async function nameIsTaken(
  categoryId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  const conditions = [
    eq(items.categoryId, categoryId),
    sql`lower(${items.name}) = lower(${name})`,
    eq(items.isActive, true),
  ];
  if (exceptId) conditions.push(ne(items.id, exceptId));

  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(and(...conditions))
    .limit(1);

  return Boolean(row);
}

async function categoryIsActive(categoryId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.id, categoryId), eq(categories.isActive, true)))
    .limit(1);
  return Boolean(row);
}

/** Both admin pages and the billing screen change when an item changes. */
function revalidateItemSurfaces() {
  revalidatePath(ADMIN_ROUTES.items);
  revalidatePath("/bill");
}

export async function createItemAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = itemSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<{ id: string }>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error.issues),
      );
    }

    if (!(await categoryIsActive(parsed.data.categoryId))) {
      return fail<{ id: string }>(
        "CONFLICT",
        "That category no longer exists.",
        {
          categoryId: "Choose another category",
        },
      );
    }

    if (await nameIsTaken(parsed.data.categoryId, parsed.data.name)) {
      return fail<{ id: string }>(
        "CONFLICT",
        "An item with that name already exists in this category.",
        { name: "Already in use" },
      );
    }

    const [created] = await db
      .insert(items)
      .values({ ...parsed.data, createdBy: user.id })
      .returning({ id: items.id });

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_CREATED",
      entityType: "item",
      entityId: created.id,
      after: parsed.data,
    });

    revalidateItemSurfaces();
    return ok(created);
  });
}

export async function updateItemAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const parsed = updateItemSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error.issues),
      );
    }

    const { id, ...values } = parsed.data;

    const before = await db.query.items.findFirst({ where: eq(items.id, id) });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That item no longer exists.");
    }

    if (!(await categoryIsActive(values.categoryId))) {
      return fail<null>("CONFLICT", "That category no longer exists.", {
        categoryId: "Choose another category",
      });
    }

    if (await nameIsTaken(values.categoryId, values.name, id)) {
      return fail<null>(
        "CONFLICT",
        "An item with that name already exists in this category.",
        { name: "Already in use" },
      );
    }

    await db
      .update(items)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(items.id, id));

    // A price change is logged as its own action so price history stays
    // directly queryable without a separate table. See spec §6.8.
    if (before.price !== values.price) {
      await writeAuditLog({
        actorId: user.id,
        action: "ITEM_PRICE_CHANGED",
        entityType: "item",
        entityId: id,
        before: { price: before.price },
        after: { price: values.price },
      });
    }

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_UPDATED",
      entityType: "item",
      entityId: id,
      before: {
        name: before.name,
        categoryId: before.categoryId,
        price: before.price,
        imageUrl: before.imageUrl,
        isAvailable: before.isAvailable,
        sortOrder: before.sortOrder,
      },
      after: values,
    });

    // Replacing the image orphans the old file in ImageKit; remove it.
    if (before.imageFileId && before.imageFileId !== values.imageFileId) {
      try {
        await deleteFile(before.imageFileId);
      } catch (error) {
        // A stale file costs a few KB. Never fail the save over it.
        console.error(
          "Failed to delete replaced image",
          before.imageFileId,
          error,
        );
      }
    }

    revalidateItemSurfaces();
    return ok(null);
  });
}

export async function deleteItemAction(payload: {
  id: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const before = await db.query.items.findFirst({
      where: eq(items.id, payload.id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That item no longer exists.");
    }

    // Soft delete only. A hard delete would orphan or cascade sales history.
    await db
      .update(items)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(items.id, payload.id));

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_DELETED",
      entityType: "item",
      entityId: payload.id,
      before: { name: before.name, price: before.price },
    });

    // The image is deliberately NOT deleted — a retired item may still be
    // opened from an old bill, and the storage cost is negligible.

    revalidateItemSurfaces();
    return ok(null);
  });
}

export async function toggleItemAvailabilityAction(payload: {
  id: string;
  isAvailable: boolean;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireSuperadmin();

    const before = await db.query.items.findFirst({
      where: eq(items.id, payload.id),
    });
    if (!before || !before.isActive) {
      return fail<null>("NOT_FOUND", "That item no longer exists.");
    }

    await db
      .update(items)
      .set({ isAvailable: payload.isAvailable, updatedAt: new Date() })
      .where(eq(items.id, payload.id));

    await writeAuditLog({
      actorId: user.id,
      action: "ITEM_UPDATED",
      entityType: "item",
      entityId: payload.id,
      before: { isAvailable: before.isAvailable },
      after: { isAvailable: payload.isAvailable },
    });

    revalidateItemSurfaces();
    return ok(null);
  });
}
```

- [ ] **Step 5: Verify price-change auditing and soft delete**

Create `scripts/verify-items.ts`:

```ts
import { desc, eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import { auditLog, categories, items } from "../src/db/schema";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.isActive, true))
    .limit(1);

  await db.execute(sql`DELETE FROM items WHERE name = 'Audit Probe Item'`);

  const [created] = await db
    .insert(items)
    .values({
      categoryId: category.id,
      name: "Audit Probe Item",
      price: "50.00",
    })
    .returning({ id: items.id });

  // Simulate what updateItemAction does on a price change.
  await db
    .update(items)
    .set({ price: "75.00" })
    .where(eq(items.id, created.id));
  await db.insert(auditLog).values({
    action: "ITEM_PRICE_CHANGED",
    entityType: "item",
    entityId: created.id,
    before: { price: "50.00" },
    after: { price: "75.00" },
  });

  const [logged] = await db
    .select({ before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(eq(auditLog.entityId, created.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(1);

  check(
    "price history is queryable from the audit log",
    (logged?.before as { price: string })?.price === "50.00" &&
      (logged?.after as { price: string })?.price === "75.00",
    logged,
  );

  // Soft delete must free the name within the category.
  await db
    .update(items)
    .set({ isActive: false })
    .where(eq(items.id, created.id));
  const [reused] = await db
    .insert(items)
    .values({
      categoryId: category.id,
      name: "Audit Probe Item",
      price: "1.00",
    })
    .returning({ id: items.id });
  check("a retired item's name can be reused", Boolean(reused?.id));

  await db.execute(
    sql`DELETE FROM audit_log WHERE entity_id = ${created.id}::uuid`,
  );
  await db.execute(sql`DELETE FROM items WHERE name = 'Audit Probe Item'`);

  console.log(
    failures === 0 ? "\nAll item checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`: `"verify:items": "tsx --env-file=.env.local scripts/verify-items.ts"`

```bash
npm run verify:items
```

Expected: two `PASS` lines.

---

### Task 6: Item management UI

**Files:**

- Create: `src/components/pages/administration/items/ItemsTab.tsx`, `ItemsColumns.tsx`
- Create: `src/components/pages/administration/items/components/ItemsTableToolbar.tsx`
- Create: `src/components/pages/administration/items/create-update-item-dialog/CreateUpdateItemDialog.tsx`
- Create: `src/components/pages/administration/items/create-update-item-dialog/components/ItemImageUploader.tsx`
- Create: `src/components/pages/administration/items/hooks/useItemsTab.ts`
- Modify: `src/app/(app)/administration/items/page.tsx`

**Interfaces:**

- Consumes: `listItemsForAdmin`, `listCategoryOptions`, all item actions, `getUploadTokenAction`, `MoneyInput`, `ConfirmDialog`, `thumbnailUrl`
- Produces: a working `/administration/items` route

- [ ] **Step 1: Create the image uploader**

`src/components/pages/administration/items/create-update-item-dialog/components/ItemImageUploader.tsx`:

```tsx
"use client";

import { ImagePlus, Loader2, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  thumbnailUrl,
  UPLOAD_ENDPOINT,
} from "@/lib/storage";
import { getUploadTokenAction } from "@/server/items/upload-token-action";

export function ItemImageUploader({
  imageUrl,
  onChange,
  disabled,
}: {
  imageUrl: string | null;
  onChange: (next: {
    imageUrl: string | null;
    imageFileId: string | null;
  }) => void;
  disabled: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleFile(file: File) {
    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
      )
    ) {
      toast.error("Use a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }

    setIsUploading(true);
    try {
      const auth = await getUploadTokenAction();
      if (!auth.ok) {
        toast.error(auth.error.message);
        return;
      }

      const body = new FormData();
      body.append("file", file);
      body.append("fileName", file.name);
      body.append("publicKey", auth.data.publicKey);
      body.append("signature", auth.data.signature);
      body.append("expire", String(auth.data.expire));
      body.append("token", auth.data.token);
      body.append("folder", "/billing/items");
      body.append("useUniqueFileName", "true");

      // Straight to ImageKit — never through a Netlify function.
      const response = await fetch(UPLOAD_ENDPOINT, { method: "POST", body });
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const uploaded = (await response.json()) as {
        url: string;
        fileId: string;
      };
      onChange({ imageUrl: uploaded.url, imageFileId: uploaded.fileId });
      toast.success("Image uploaded");
    } catch (error) {
      console.error("Image upload failed", error);
      toast.error("Image upload failed. Try again.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="relative size-20 shrink-0 overflow-hidden rounded-md border bg-muted">
        {imageUrl ? (
          <Image
            src={thumbnailUrl(imageUrl, 160)}
            alt=""
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImagePlus className="size-5" />
          </div>
        )}
        {isUploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || isUploading}
          onClick={() => inputRef.current?.click()}
        >
          {imageUrl ? "Replace image" : "Upload image"}
        </Button>
        {imageUrl ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || isUploading}
            onClick={() => onChange({ imageUrl: null, imageFileId: null })}
          >
            <X className="size-3" />
            Remove
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          JPG, PNG or WebP. Max 5 MB.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the container hook**

`src/components/pages/administration/items/hooks/useItemsTab.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { useDebounce } from "@/hooks/use-debounce";
import { formatINR, parseRupees } from "@/lib/utils/money";
import {
  createItemAction,
  deleteItemAction,
  toggleItemAvailabilityAction,
  updateItemAction,
} from "@/server/items/items-actions";
import type { AdminItemRow } from "@/types/item.types";

export type ItemFormState = {
  id: string | null;
  name: string;
  categoryId: string;
  priceInput: string;
  imageUrl: string | null;
  imageFileId: string | null;
  isAvailable: boolean;
  sortOrder: string;
};

function emptyForm(categoryId: string): ItemFormState {
  return {
    id: null,
    name: "",
    categoryId,
    priceInput: "",
    imageUrl: null,
    imageFileId: null,
    isAvailable: true,
    sortOrder: "0",
  };
}

export function useItemsTab({
  items,
  categories,
}: {
  items: AdminItemRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const debouncedSearch = useDebounce(search);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ItemFormState>(() =>
    emptyForm(categories[0]?.id ?? ""),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pendingDelete, setPendingDelete] = useState<AdminItemRow | null>(null);

  const visibleItems = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "ALL" && item.categoryId !== categoryFilter) {
        return false;
      }
      if (!term) return true;
      return (
        item.name.toLowerCase().includes(term) ||
        item.categoryName.toLowerCase().includes(term)
      );
    });
  }, [items, categoryFilter, debouncedSearch]);

  const openCreate = useCallback(() => {
    setForm(emptyForm(categories[0]?.id ?? ""));
    setFieldErrors({});
    setDialogOpen(true);
  }, [categories]);

  const openEdit = useCallback((row: AdminItemRow) => {
    setForm({
      id: row.id,
      name: row.name,
      categoryId: row.categoryId,
      // Already a rupee decimal string — nothing to convert.
      priceInput: row.price,
      imageUrl: row.imageUrl,
      imageFileId: row.imageFileId,
      isAvailable: row.isAvailable,
      sortOrder: String(row.sortOrder),
    });
    setFieldErrors({});
    setDialogOpen(true);
  }, []);

  const submit = useCallback(() => {
    setFieldErrors({});

    let price: string;
    try {
      price = parseRupees(form.priceInput || "0");
    } catch {
      setFieldErrors({ price: "Enter a valid amount, e.g. 60.50" });
      return;
    }

    startTransition(async () => {
      const payload = {
        name: form.name,
        categoryId: form.categoryId,
        price,
        imageUrl: form.imageUrl,
        imageFileId: form.imageFileId,
        isAvailable: form.isAvailable,
        sortOrder: Number(form.sortOrder) || 0,
      };

      const result = form.id
        ? await updateItemAction({ ...payload, id: form.id })
        : await createItemAction(payload);

      if (result.ok) {
        toast.success(
          form.id
            ? `Saved — ${form.name} is ${formatINR(price)}`
            : `Added ${form.name}`,
        );
        setDialogOpen(false);
        router.refresh();
        return;
      }

      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router]);

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;
    const target = pendingDelete;

    startTransition(async () => {
      const result = await deleteItemAction({ id: target.id });
      if (result.ok) {
        toast.success(`“${target.name}” removed from the menu`);
      } else {
        toast.error(result.error.message);
      }
      setPendingDelete(null);
      router.refresh();
    });
  }, [pendingDelete, router]);

  const toggleAvailability = useCallback(
    (row: AdminItemRow) => {
      startTransition(async () => {
        const result = await toggleItemAvailabilityAction({
          id: row.id,
          isAvailable: !row.isAvailable,
        });
        if (result.ok) {
          toast.success(
            row.isAvailable
              ? `${row.name} marked sold out`
              : `${row.name} is back on`,
          );
          router.refresh();
        } else {
          toast.error(result.error.message);
        }
      });
    },
    [router],
  );

  return {
    search,
    setSearch,
    categoryFilter,
    setCategoryFilter,
    visibleItems,
    categories,

    dialogOpen,
    setDialogOpen,
    form,
    setForm,
    fieldErrors,
    openCreate,
    openEdit,
    submit,

    pendingDelete,
    setPendingDelete,
    confirmDelete,
    toggleAvailability,

    isPending,
  };
}
```

- [ ] **Step 3: Create the columns**

`src/components/pages/administration/items/ItemsColumns.tsx`:

```tsx
"use client";

import { Pencil, Trash2 } from "lucide-react";
import Image from "next/image";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TableCell, TableRow } from "@/components/ui/table";
import { thumbnailUrl } from "@/lib/storage";
import { formatINR } from "@/lib/utils/money";
import type { AdminItemRow } from "@/types/item.types";

export const ITEM_HEADERS = [
  "",
  "Name",
  "Category",
  "Price",
  "Available",
  "Order",
  "",
] as const;

export function ItemTableRow({
  row,
  onEdit,
  onDelete,
  onToggleAvailability,
  disabled,
}: {
  row: AdminItemRow;
  onEdit: (row: AdminItemRow) => void;
  onDelete: (row: AdminItemRow) => void;
  onToggleAvailability: (row: AdminItemRow) => void;
  disabled: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <div className="relative size-10 overflow-hidden rounded bg-muted">
          {row.imageUrl ? (
            <Image
              src={thumbnailUrl(row.imageUrl, 80)}
              alt=""
              fill
              sizes="40px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-semibold text-muted-foreground">
              {row.name.charAt(0)}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        <Badge variant="secondary">{row.categoryName}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{formatINR(row.price)}</TableCell>
      <TableCell>
        <Switch
          checked={row.isAvailable}
          disabled={disabled}
          aria-label={`${row.name} available`}
          onCheckedChange={() => onToggleAvailability(row)}
        />
      </TableCell>
      <TableCell className="tabular-nums">{row.sortOrder}</TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Edit ${row.name}`}
          onClick={() => onEdit(row)}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Remove ${row.name}`}
          onClick={() => onDelete(row)}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 4: Create the toolbar**

`src/components/pages/administration/items/components/ItemsTableToolbar.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ItemsTableToolbar({
  search,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categories: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-56 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search items…"
          className="pl-9"
          aria-label="Search items"
        />
      </div>

      <Select value={categoryFilter} onValueChange={onCategoryFilterChange}>
        <SelectTrigger className="w-48">
          <SelectValue placeholder="All categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 5: Create the item dialog**

`src/components/pages/administration/items/create-update-item-dialog/CreateUpdateItemDialog.tsx`:

```tsx
"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

import type { ItemFormState } from "../hooks/useItemsTab";
import { ItemImageUploader } from "./components/ItemImageUploader";

export function CreateUpdateItemDialog({
  open,
  onOpenChange,
  form,
  setForm,
  categories,
  fieldErrors,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: ItemFormState;
  setForm: (next: ItemFormState) => void;
  categories: Array<{ id: string; name: string }>;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit item" : "New item"}</DialogTitle>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <ItemImageUploader
            imageUrl={form.imageUrl}
            disabled={isPending}
            onChange={(next) => setForm({ ...form, ...next })}
          />

          <div className="space-y-2">
            <Label htmlFor="item-name">Name</Label>
            <Input
              id="item-name"
              value={form.name}
              autoFocus
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            {fieldErrors.name ? (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-category">Category</Label>
              <Select
                value={form.categoryId}
                disabled={isPending}
                onValueChange={(value) =>
                  setForm({ ...form, categoryId: value })
                }
              >
                <SelectTrigger id="item-category">
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldErrors.categoryId ? (
                <p className="text-sm text-destructive">
                  {fieldErrors.categoryId}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="item-price">Price ₹</Label>
              <MoneyInput
                id="item-price"
                value={form.priceInput}
                disabled={isPending}
                invalid={Boolean(fieldErrors.price)}
                onChange={(value) => setForm({ ...form, priceInput: value })}
              />
              {fieldErrors.price ? (
                <p className="text-sm text-destructive">{fieldErrors.price}</p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="item-sort">Display order</Label>
              <Input
                id="item-sort"
                inputMode="numeric"
                value={form.sortOrder}
                disabled={isPending}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "" || /^\d{0,4}$/.test(next)) {
                    setForm({ ...form, sortOrder: next });
                  }
                }}
              />
            </div>

            <div className="flex items-center gap-2 pb-2">
              <Switch
                id="item-available"
                checked={form.isAvailable}
                disabled={isPending}
                onCheckedChange={(checked) =>
                  setForm({ ...form, isAvailable: checked })
                }
              />
              <Label htmlFor="item-available" className="font-normal">
                Available today
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Create the tab and the route**

`src/components/pages/administration/items/ItemsTab.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AdminItemRow } from "@/types/item.types";

import { ItemsTableToolbar } from "./components/ItemsTableToolbar";
import { CreateUpdateItemDialog } from "./create-update-item-dialog/CreateUpdateItemDialog";
import { useItemsTab } from "./hooks/useItemsTab";
import { ITEM_HEADERS, ItemTableRow } from "./ItemsColumns";

export function ItemsTab({
  items,
  categories,
}: {
  items: AdminItemRow[];
  categories: Array<{ id: string; name: string }>;
}) {
  const tab = useItemsTab({ items, categories });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Items</h1>
          <p className="text-sm text-muted-foreground">
            Everything the till can sell.
          </p>
        </div>
        <Button onClick={tab.openCreate} disabled={categories.length === 0}>
          <Plus className="size-4" />
          New item
        </Button>
      </div>

      {categories.length === 0 ? (
        <TableEmptyState
          title="Add a category first"
          description="Every item belongs to a category. Create one under Categories, then come back."
        />
      ) : (
        <>
          <ItemsTableToolbar
            search={tab.search}
            onSearchChange={tab.setSearch}
            categoryFilter={tab.categoryFilter}
            onCategoryFilterChange={tab.setCategoryFilter}
            categories={tab.categories}
          />

          {tab.visibleItems.length === 0 ? (
            <TableEmptyState
              title="No items match"
              description="Try a different search term or category."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {ITEM_HEADERS.map((header, index) => (
                    <TableHead
                      key={header || `col-${index}`}
                      className={
                        index === ITEM_HEADERS.length - 1 ? "text-right" : ""
                      }
                    >
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {tab.visibleItems.map((row) => (
                  <ItemTableRow
                    key={row.id}
                    row={row}
                    onEdit={tab.openEdit}
                    onDelete={tab.setPendingDelete}
                    onToggleAvailability={tab.toggleAvailability}
                    disabled={tab.isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <CreateUpdateItemDialog
        open={tab.dialogOpen}
        onOpenChange={tab.setDialogOpen}
        form={tab.form}
        setForm={tab.setForm}
        categories={tab.categories}
        fieldErrors={tab.fieldErrors}
        onSubmit={tab.submit}
        isPending={tab.isPending}
      />

      <ConfirmDialog
        open={tab.pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) tab.setPendingDelete(null);
        }}
        title={`Remove “${tab.pendingDelete?.name}”?`}
        description="It disappears from the billing screen immediately. Past bills keep this item, so reports and receipts are unaffected."
        confirmLabel="Remove"
        destructive
        isPending={tab.isPending}
        onConfirm={tab.confirmDelete}
      />
    </div>
  );
}
```

`src/app/(app)/administration/items/page.tsx` (replace the placeholder):

```tsx
import { ItemsTab } from "@/components/pages/administration/items/ItemsTab";
import { listCategoryOptions } from "@/server/categories/categories-queries";
import { listItemsForAdmin } from "@/server/items/items-queries";

export const metadata = {
  title: "Items",
  description: "Manage the menu.",
};

export default async function Page() {
  const [items, categories] = await Promise.all([
    listItemsForAdmin(),
    listCategoryOptions(),
  ]);

  return <ItemsTab items={items} categories={categories} />;
}
```

- [ ] **Step 7: Verify the item flow — M4's gate**

```bash
npm run dev
```

At `/administration/items`, signed in as `owner`:

1. Nine seeded items listed with category badges and prices as ₹60.00 etc.
2. **Search** "bur" → filters to the burgers.
3. **Category filter** → Drinks → three items.
4. **New item** → name "Ice Cream", category Drinks, price `45.50`, upload a JPG → saves.
5. Confirm in the database that the price stored is **4550**, not a float:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`SELECT name, price, image_url FROM items WHERE name = 'Ice Cream'\`);
console.table(r.rows);
process.exit(0);
"
```

6. Open `/bill` → **Ice Cream** appears with its photo, priced ₹45.50.
7. Back in items, toggle **Available** off → reload `/bill` → the card is greyed out with a **SOLD OUT** badge and cannot be tapped.
8. **Edit** Ice Cream, change price to `50` → save. Check the audit log recorded a price change:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`SELECT action, before, after FROM audit_log WHERE action = 'ITEM_PRICE_CHANGED' ORDER BY created_at DESC LIMIT 1\`);
console.log(JSON.stringify(r.rows, null, 2));
process.exit(0);
"
```

Expected: `before: {"price": 4550}`, `after: {"price": 5000}`.

9. **Remove** Ice Cream → confirm → gone from both `/administration/items` and `/bill`.
10. **Critically:** open the bill you created in Plan 1 at `/bills` (Task 13) or directly via `/print/<id>` — it still shows its original items at their original prices. Renaming and deleting did not rewrite history.

```bash
npm run verify:all && npm run verify:items && npm run verify:categories && npm run verify:imagekit
```

Expected: all green.

---

# M5 — Reports

> **Rule for every task in M5:** revenue figures exclude voided bills
> (`status = 'COMPLETED'`), and every figure comes from `bill_items` snapshot
> columns. Voided bills still appear in the ledger — they just do not count as
> money.

### Task 7: Report types, date ranges and CSV

**Files:**

- Create: `src/lib/utils/date-range.ts`, `src/lib/utils/csv.ts`
- Create: `src/types/report.types.ts`

**Interfaces:**

- Consumes: `businessDate`
- Produces:
  - `presetRange(preset: RangePreset, timeZone: string): { from: string; to: string }`
  - `RANGE_PRESETS`, `type RangePreset`
  - `isValidIsoDate(value: string): boolean`, `eachDateInRange(from, to): string[]`
  - `toCsv(rows: Array<Record<string, string | number>>, headers): string`
  - `DashboardStats`, `SalesByDayRow`, `ItemSalesRow`, `PaymentBreakdownRow`, `BillLedgerRow`, `BillDetail`

- [ ] **Step 1: Create the date-range helpers**

`src/lib/utils/date-range.ts`:

```ts
import { businessDate } from "./dates";

export const RANGE_PRESETS = [
  "TODAY",
  "YESTERDAY",
  "LAST_7",
  "LAST_30",
  "THIS_MONTH",
] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_PRESET_LABELS: Record<RangePreset, string> = {
  TODAY: "Today",
  YESTERDAY: "Yesterday",
  LAST_7: "Last 7 days",
  LAST_30: "Last 30 days",
  THIS_MONTH: "This month",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

/** Shifts a YYYY-MM-DD string by whole days without touching timezones. */
export function shiftIsoDate(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Presets are computed from the SHOP's today, not the server's, so a report
 * run at 01:00 IST still means the right day.
 */
export function presetRange(
  preset: RangePreset,
  timeZone: string,
): { from: string; to: string } {
  const today = businessDate(new Date(), timeZone);

  switch (preset) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const yesterday = shiftIsoDate(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "LAST_7":
      return { from: shiftIsoDate(today, -6), to: today };
    case "LAST_30":
      return { from: shiftIsoDate(today, -29), to: today };
    case "THIS_MONTH":
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/** Every date in an inclusive range — used to fill chart gaps with zeros. */
export function eachDateInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  // Guard against an inverted range producing an infinite loop.
  let guard = 0;
  while (cursor <= to && guard < 1000) {
    dates.push(cursor);
    cursor = shiftIsoDate(cursor, 1);
    guard += 1;
  }
  return dates;
}
```

- [ ] **Step 2: Create the CSV helper**

`src/lib/utils/csv.ts`:

```ts
import { formatReceiptAmount } from "./money";

export type CsvColumn<T> = {
  header: string;
  value: (row: T) => string | number;
};

/**
 * Escapes per RFC 4180: wrap in quotes when the value contains a comma, quote
 * or newline, and double any embedded quotes.
 */
function escapeCell(value: string | number): string {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCell(column.header)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.value(row))).join(","),
  );
  // Excel on Windows wants CRLF; a BOM makes it read UTF-8 rather than ANSI,
  // which matters for the ₹ sign and any non-ASCII item names.
  return `﻿${[header, ...body].join("\r\n")}\r\n`;
}

/**
 * Rupee amount with no symbol and no grouping — the form a spreadsheet parses.
 *
 * Takes the decimal string the database returned and normalises it to two
 * places. Never accepts a number: `csvAmount(110.79)` would already have lost
 * precision before the call.
 */
export function csvAmount(rupees: string): string {
  return formatReceiptAmount(rupees);
}
```

- [ ] **Step 3: Create the report types**

`src/types/report.types.ts`:

```ts
import type { PaymentMethod } from "@/constants/payment-methods";

export type DashboardStats = {
  businessDate: string;
  billCount: number;
  gross: string;
  discount: string;
  net: string;
  averageBill: string;
  topItemName: string | null;
  topItemQuantity: number;
};

export type SalesByDayRow = {
  businessDate: string;
  billCount: number;
  gross: string;
  discount: string;
  net: string;
};

export type PaymentBreakdownRow = {
  paymentMethod: PaymentMethod;
  billCount: number;
  net: string;
};

export type ItemSalesRow = {
  itemName: string;
  categoryName: string;
  quantity: number;
  revenue: string;
  /** Share of total revenue in the range, 0-100, rounded to one decimal. */
  sharePercent: number;
};

export type BillLedgerRow = {
  id: string;
  billNumber: number;
  businessDate: string;
  createdAt: Date;
  /** Rupees, e.g. "140.00". */
  total: string;
  paymentMethod: PaymentMethod;
  status: "COMPLETED" | "VOID";
  cashierName: string;
  lineCount: number;
};

export type BillLedgerFilters = {
  from: string;
  to: string;
  cashierId?: string;
  paymentMethod?: PaymentMethod;
  billNumber?: number;
};

export type BillLedgerPage = {
  rows: BillLedgerRow[];
  /** Total matching ROWS, not an amount. */
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 4: Verify the date and CSV helpers**

Create `scripts/verify-reports-utils.ts`:

```ts
import { csvAmount, toCsv } from "../src/lib/utils/csv";
import {
  eachDateInRange,
  isValidIsoDate,
  presetRange,
  shiftIsoDate,
} from "../src/lib/utils/date-range";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"} — ${label}` +
      (pass
        ? ""
        : `: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`),
  );
}

check("shiftIsoDate forward", shiftIsoDate("2026-08-26", 1), "2026-08-27");
check("shiftIsoDate back", shiftIsoDate("2026-08-01", -1), "2026-07-31");
check(
  "shiftIsoDate across a year",
  shiftIsoDate("2026-01-01", -1),
  "2025-12-31",
);
check(
  "shiftIsoDate across a leap day",
  shiftIsoDate("2028-02-28", 1),
  "2028-02-29",
);

check("isValidIsoDate accepts", isValidIsoDate("2026-08-26"), true);
check(
  "isValidIsoDate rejects a bad shape",
  isValidIsoDate("26/08/2026"),
  false,
);
check("isValidIsoDate rejects junk", isValidIsoDate("hello"), false);

check(
  "eachDateInRange is inclusive",
  eachDateInRange("2026-08-25", "2026-08-27"),
  ["2026-08-25", "2026-08-26", "2026-08-27"],
);
check(
  "eachDateInRange single day",
  eachDateInRange("2026-08-25", "2026-08-25"),
  ["2026-08-25"],
);
check(
  "eachDateInRange handles an inverted range",
  eachDateInRange("2026-08-27", "2026-08-25"),
  [],
);

const last7 = presetRange("LAST_7", "Asia/Kolkata");
check(
  "LAST_7 spans seven days inclusive",
  eachDateInRange(last7.from, last7.to).length,
  7,
);

check("csvAmount", csvAmount(6050), "60.50");
check("csvAmount zero", csvAmount(0), "0.00");
check("csvAmount negative", csvAmount(-1000), "-10.00");

const csv = toCsv(
  [{ name: 'Burger, "large"', qty: 2 }],
  [
    { header: "Item", value: (r) => r.name },
    { header: "Qty", value: (r) => r.qty },
  ],
);
check(
  "toCsv escapes commas and quotes",
  csv,
  '﻿Item,Qty\r\n"Burger, ""large""",2\r\n',
);

console.log(
  failures === 0
    ? "\nAll report utility checks passed."
    : `\n${failures} FAILURE(S)`,
);
process.exit(failures === 0 ? 0 : 1);
```

Add to `package.json`: `"verify:reports": "tsx scripts/verify-reports-utils.ts"`

```bash
npm run verify:reports
```

Expected: 16 `PASS` lines. The CSV escaping case is the one that silently corrupts a spreadsheet if wrong — an item named `Burger, "large"` must not split into two columns.

---

### Task 8: Report queries

**Files:**

- Create: `src/server/reports/reports-queries.ts`

**Interfaces:**

- Consumes: `db`, `bills`, `billItems`, `users`, `withConnectionRetry`, `getShopTimezone`, report types
- Produces:
  - `getDashboardStats(): Promise<DashboardStats>`
  - `getSalesTrend(from, to): Promise<SalesByDayRow[]>`
  - `getSalesByDay(from, to): Promise<SalesByDayRow[]>`
  - `getPaymentBreakdown(from, to): Promise<PaymentBreakdownRow[]>`
  - `getItemSales(from, to): Promise<ItemSalesRow[]>`

- [ ] **Step 1: Write the queries**

`src/server/reports/reports-queries.ts`:

```ts
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { billItems, bills } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import { businessDate } from "@/lib/utils/dates";
import { add, divide, isZero, toAmount, ZERO } from "@/lib/utils/money";
import { getShopTimezone } from "@/server/settings/settings-queries";
import type {
  DashboardStats,
  ItemSalesRow,
  PaymentBreakdownRow,
  SalesByDayRow,
} from "@/types/report.types";

/**
 * Voided bills are excluded from every money figure. They remain visible in
 * the ledger — a void is a fact about the day, not revenue.
 */
const COMPLETED = eq(bills.status, "COMPLETED");

function inRange(from: string, to: string) {
  return and(
    COMPLETED,
    gte(bills.businessDate, from),
    lte(bills.businessDate, to),
  );
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return withConnectionRetry(async () => {
    const timeZone = await getShopTimezone();
    const today = businessDate(new Date(), timeZone);

    // Aggregates over numeric columns stay numeric, and the driver hands
    // those back as decimal STRINGS. Do not cast to ::int — that would
    // truncate every amount to whole rupees.
    const [totals] = await db
      .select({
        billCount: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${bills.subtotal}), 0)::text`,
        discount: sql<string>`coalesce(sum(${bills.discount}), 0)::text`,
        net: sql<string>`coalesce(sum(${bills.total}), 0)::text`,
      })
      .from(bills)
      .where(and(COMPLETED, eq(bills.businessDate, today)));

    // Snapshot columns only — a renamed item must not change today's top seller.
    const [topItem] = await db
      .select({
        itemName: billItems.itemName,
        quantity: sql<number>`sum(${billItems.quantity})::int`,
        revenue: sql<string>`sum(${billItems.lineTotal})::text`,
      })
      .from(billItems)
      .innerJoin(bills, eq(bills.id, billItems.billId))
      .where(and(COMPLETED, eq(bills.businessDate, today)))
      .groupBy(billItems.itemName)
      .orderBy(desc(sql`sum(${billItems.lineTotal})`))
      .limit(1);

    const billCount = totals?.billCount ?? 0;
    const net = toAmount(totals?.net ?? "0");

    return {
      businessDate: today,
      billCount,
      gross: toAmount(totals?.gross ?? "0"),
      discount: toAmount(totals?.discount ?? "0"),
      net,
      // divide() rounds to two decimals; averaging is the one money operation
      // here that is not exact, and rounding it once at the end is correct.
      averageBill: billCount === 0 ? ZERO : divide(net, billCount),
      topItemName: topItem?.itemName ?? null,
      topItemQuantity: topItem?.quantity ?? 0,
    };
  });
}

export async function getSalesByDay(
  from: string,
  to: string,
): Promise<SalesByDayRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        businessDate: bills.businessDate,
        billCount: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${bills.subtotal}), 0)::text`,
        discount: sql<string>`coalesce(sum(${bills.discount}), 0)::text`,
        net: sql<string>`coalesce(sum(${bills.total}), 0)::text`,
      })
      .from(bills)
      .where(inRange(from, to))
      .groupBy(bills.businessDate)
      .orderBy(asc(bills.businessDate)),
  );
}

/** Same shape as getSalesByDay; named separately because the chart may diverge. */
export async function getSalesTrend(
  from: string,
  to: string,
): Promise<SalesByDayRow[]> {
  return getSalesByDay(from, to);
}

export async function getPaymentBreakdown(
  from: string,
  to: string,
): Promise<PaymentBreakdownRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        paymentMethod: bills.paymentMethod,
        billCount: sql<number>`count(*)::int`,
        net: sql<string>`coalesce(sum(${bills.total}), 0)::text`,
      })
      .from(bills)
      .where(inRange(from, to))
      .groupBy(bills.paymentMethod)
      .orderBy(desc(sql`sum(${bills.total})`)),
  );
}

export async function getItemSales(
  from: string,
  to: string,
): Promise<ItemSalesRow[]> {
  return withConnectionRetry(async () => {
    const rows = await db
      .select({
        itemName: billItems.itemName,
        categoryName: billItems.categoryName,
        quantity: sql<number>`sum(${billItems.quantity})::int`,
        revenue: sql<string>`sum(${billItems.lineTotal})::text`,
      })
      .from(billItems)
      .innerJoin(bills, eq(bills.id, billItems.billId))
      .where(inRange(from, to))
      .groupBy(billItems.itemName, billItems.categoryName)
      .orderBy(desc(sql`sum(${billItems.lineTotal})`));

    const totalRevenue = rows.reduce(
      (sum, row) => add(sum, toAmount(row.revenue)),
      ZERO,
    );

    return rows.map((row) => ({
      ...row,
      revenue: toAmount(row.revenue),
      // sharePercent is a display percentage, not money — a float is fine
      // here, and it is never summed back into an amount.
      sharePercent: isZero(totalRevenue)
        ? 0
        : Math.round((Number(row.revenue) / Number(totalRevenue)) * 1000) / 10,
    }));
  });
}
```

- [ ] **Step 2: Verify the aggregates against known data**

Create `scripts/verify-report-queries.ts`:

```ts
import { sql } from "drizzle-orm";

import { db } from "../src/db";
import {
  getDashboardStats,
  getItemSales,
  getPaymentBreakdown,
  getSalesByDay,
} from "../src/server/reports/reports-queries";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  const stats = await getDashboardStats();
  console.log("dashboard:", stats);

  // Cross-check the dashboard against a plain SQL sum.
  const [truth] = (
    await db.execute(sql`
      SELECT count(*)::int AS n, coalesce(sum(total),0)::int AS net
      FROM bills WHERE business_date = ${stats.businessDate} AND status = 'COMPLETED'`)
  ).rows as Array<{ n: number; net: string }>;

  check("dashboard bill count matches SQL", stats.billCount === truth.n, {
    stats: stats.billCount,
    sql: truth.n,
  });
  check("dashboard net matches SQL", compare(stats.net, truth.net) === 0, {
    stats: stats.net,
    sql: truth.net,
  });
  check(
    "average = net / count (integer)",
    stats.billCount === 0
      ? stats.averageBill === 0
      : stats.averageBill === divide(stats.net, stats.billCount),
  );
  check(
    "every money figure is a two-decimal rupee string",
    [stats.gross, stats.net, stats.averageBill].every((v) =>
      /^-?d+.d{2}$/.test(v),
    ),
    stats,
  );

  const days = await getSalesByDay(stats.businessDate, stats.businessDate);
  check(
    "sales-by-day net equals the dashboard net",
    compare(days[0]?.net ?? ZERO, stats.net) === 0,
    days,
  );
  check(
    "gross - discount = net for every day",
    days.every((d) => compare(subtract(d.gross, d.discount), d.net) === 0),
    days,
  );

  const payments = await getPaymentBreakdown(
    stats.businessDate,
    stats.businessDate,
  );
  check(
    "payment breakdown sums to the day's net",
    compare(
      payments.reduce((sum, p) => add(sum, p.net), ZERO),
      stats.net,
    ) === 0,
    payments,
  );

  const itemSales = await getItemSales(stats.businessDate, stats.businessDate);
  console.table(itemSales);
  const shareSum = itemSales.reduce((sum, r) => sum + r.sharePercent, 0);
  check(
    "item shares total roughly 100% (or 0 with no sales)",
    itemSales.length === 0 || Math.abs(shareSum - 100) < 0.5,
    shareSum,
  );

  // A voided bill must not count as revenue.
  const [anyBill] = (
    await db.execute(
      sql`SELECT id, total FROM bills WHERE status = 'COMPLETED' AND business_date = ${stats.businessDate} LIMIT 1`,
    )
  ).rows as Array<{ id: string; total: string }>;

  if (anyBill) {
    await db.execute(
      sql`UPDATE bills SET status = 'VOID', voided_at = now(), void_reason = 'probe' WHERE id = ${anyBill.id}::uuid`,
    );
    const afterVoid = await getDashboardStats();
    check(
      "voiding a bill removes it from revenue",
      compare(afterVoid.net, subtract(stats.net, anyBill.total)) === 0,
      { before: stats.net, after: afterVoid.net, voided: anyBill.total },
    );
    await db.execute(
      sql`UPDATE bills SET status = 'COMPLETED', voided_at = NULL, void_reason = NULL WHERE id = ${anyBill.id}::uuid`,
    );
  } else {
    console.log("SKIP — no completed bill available to void-test");
  }

  console.log(
    failures === 0
      ? "\nAll report query checks passed."
      : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`: `"verify:report-queries": "tsx --env-file=.env.local scripts/verify-report-queries.ts"`

- [ ] **Step 3: Run it**

```bash
npm run verify:report-queries
```

Expected: all `PASS`. The void test is the one that matters — if voiding a bill does not remove it from revenue, the owner's takings are wrong.

---

### Task 9: Dashboard

**Files:**

- Create: `src/components/pages/dashboard/DashboardPage.tsx`
- Create: `src/components/pages/dashboard/components/StatCard.tsx`, `SalesTrendChart.tsx`, `TopItemsCard.tsx`
- Create: `src/app/(app)/dashboard/page.tsx`

**Interfaces:**

- Consumes: `getDashboardStats`, `getSalesTrend`, `getItemSales`, `presetRange`, `eachDateInRange`, `formatINR`
- Produces: a working `/dashboard` route

> **The dashboard is the landing page after sign-in**, per spec §10 and the
> client's instruction. It lives at `/dashboard`; `/` and the post-login
> redirect both point at it. Plan 1 temporarily sent both to `/bill` because
> the dashboard did not exist yet — Step 5 below switches them over.
>
> The billing screen stays one click away as the first navbar item, so a
> cashier reaches the till immediately.

- [ ] **Step 1: Create the stat card**

`src/components/pages/dashboard/components/StatCard.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold tabular-nums">{value}</p>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Create the trend chart**

`src/components/pages/dashboard/components/SalesTrendChart.tsx`:

```tsx
"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatINR } from "@/lib/utils/money";

const CHART_CONFIG = {
  net: { label: "Sales", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function SalesTrendChart({
  data,
}: {
  data: Array<{ label: string; net: number }>; // numbers: Recharts plots numerically
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Last 7 days</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={CHART_CONFIG} className="h-64 w-full">
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={70}
              // Chart ticks only. Amounts are converted to numbers at the
              tickFormatter={(value: number) => formatINR(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatINR(Number(value))}
                />
              }
            />
            <Bar dataKey="net" fill="var(--color-net)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Create the top-items card**

`src/components/pages/dashboard/components/TopItemsCard.tsx`:

```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR } from "@/lib/utils/money";
import type { ItemSalesRow } from "@/types/report.types";

export function TopItemsCard({ items }: { items: ItemSalesRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top sellers today</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales yet today.</p>
        ) : (
          <ol className="space-y-3">
            {items.slice(0, 5).map((item, index) => (
              <li key={item.itemName} className="flex items-center gap-3">
                <span className="w-4 text-sm text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {item.itemName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity} sold · {item.sharePercent}% of takings
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums">
                  {formatINR(item.revenue)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the page and route**

`src/components/pages/dashboard/DashboardPage.tsx`:

```tsx
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type {
  DashboardStats,
  ItemSalesRow,
  SalesByDayRow,
} from "@/types/report.types";

import { SalesTrendChart } from "./components/SalesTrendChart";
import { StatCard } from "./components/StatCard";
import { TopItemsCard } from "./components/TopItemsCard";

export function DashboardPage({
  stats,
  trend,
  topItems,
  chartDates,
}: {
  stats: DashboardStats;
  trend: SalesByDayRow[];
  topItems: ItemSalesRow[];
  /** Every date in the window, so closed days render as a zero bar. */
  chartDates: string[];
}) {
  // Without this, a day with no sales is simply absent and the chart silently
  // compresses — making a closed Monday look like it never existed.
  const byDate = new Map(trend.map((row) => [row.businessDate, row.net]));
  const chartData = chartDates.map((date) => ({
    label: formatBillDate(date).slice(0, 5),
    net: byDate.get(date) ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Today</h1>
        <p className="text-sm text-muted-foreground">
          {formatBillDate(stats.businessDate)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Sales"
          value={formatINR(stats.net)}
          hint={
            stats.discount > 0
              ? `after ${formatINR(stats.discount)} of discounts`
              : undefined
          }
        />
        <StatCard label="Bills" value={String(stats.billCount)} />
        <StatCard label="Average bill" value={formatINR(stats.averageBill)} />
        <StatCard
          label="Top item"
          value={stats.topItemName ?? "—"}
          hint={stats.topItemName ? `${stats.topItemQuantity} sold` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <SalesTrendChart data={chartData} />
        <TopItemsCard items={topItems} />
      </div>
    </div>
  );
}
```

`src/app/(app)/dashboard/page.tsx`:

```tsx
import { Container } from "@/components/layout/Container";
import { DashboardPage } from "@/components/pages/dashboard/DashboardPage";
import { requireUser } from "@/lib/auth/guard";
import { eachDateInRange, presetRange } from "@/lib/utils/date-range";
import {
  getDashboardStats,
  getItemSales,
  getSalesTrend,
} from "@/server/reports/reports-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Dashboard",
  description: "Today's sales at a glance.",
};

export default async function Page() {
  await requireUser();

  const timeZone = await getShopTimezone();
  const week = presetRange("LAST_7", timeZone);
  const today = presetRange("TODAY", timeZone);

  const [stats, trend, topItems] = await Promise.all([
    getDashboardStats(),
    getSalesTrend(week.from, week.to),
    getItemSales(today.from, today.to),
  ]);

  return (
    <Container className="py-6">
      <DashboardPage
        stats={stats}
        trend={trend}
        topItems={topItems}
        chartDates={eachDateInRange(week.from, week.to)}
      />
    </Container>
  );
}
```

Both roles may view the dashboard — spec §7.1 grants admins reports.

- [ ] **Step 5: Make the dashboard the landing page**

Now that `/dashboard` exists, point everything that lands a signed-in user at it.

`src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { REPORT_ROUTES } from "@/lib/routes/report-routes";

export default function Page() {
  redirect(REPORT_ROUTES.dashboard);
}
```

`src/proxy.ts` — the already-signed-in redirect:

```ts
if (isLoggedIn && isPublic) {
  return Response.redirect(new URL("/dashboard", req.nextUrl.origin));
}
```

`src/components/pages/login/components/LoginForm.tsx` — the fallback when there
is no `?next=`:

```tsx
const destination =
  next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
```

The `?next=` handling is unchanged, so a cashier who was sent to `/login` from
`/bill` still returns to `/bill` after signing in — only the no-destination
case changes.

- [ ] **Step 6: Verify the dashboard**

```bash
npm run dev
```

Visit `/dashboard` as `owner`:

1. Four stat cards render; **Sales** matches what `npm run verify:report-queries` printed.
2. The bar chart shows **seven bars**, one per day — days with no trading show a zero bar rather than being omitted.
3. Top sellers lists the seeded items with quantities and shares.
4. Create a new bill at `/bill`, return to `/dashboard` → the figures increase.
5. Sign in as `cashier` (ADMIN) → `/dashboard` still renders. Reports are not superadmin-only.
6. **Sign out, sign back in → you land on `/dashboard`, not `/bill`.**
7. Visit `/` while signed in → redirected to `/dashboard`.
8. Sign out, then visit `/bill` directly → sent to `/login?next=/bill`; after
   signing in you land on **`/bill`**, not the dashboard.
9. Confirm no money figure renders with more than two decimals anywhere on the
   page — a `.30000000000000004` would mean a float leaked into a total.

```bash
npx tsc --noEmit && npm run lint
```

---

### Task 10: Shared report controls and CSV export

**Files:**

- Create: `src/components/pages/reports/components/ReportDateRangeBar.tsx`, `ExportCsvButton.tsx`
- Create: `src/server/reports/reports-actions.ts`
- Create: `src/app/(app)/reports/layout.tsx`

**Interfaces:**

- Consumes: `RANGE_PRESETS`, `presetRange`, `toCsv`, `csvAmount`, report queries
- Produces:
  - `<ReportDateRangeBar from to />` — pushes `?from=&to=` into the URL
  - `<ExportCsvButton filename onExport />`
  - `exportSalesCsvAction({ from, to }): Promise<ActionResult<{ csv: string }>>`
  - `exportItemsCsvAction({ from, to }): Promise<ActionResult<{ csv: string }>>`

- [ ] **Step 1: Create the reports layout**

`src/app/(app)/reports/layout.tsx`:

```tsx
import { Container } from "@/components/layout/Container";
import { requireUser } from "@/lib/auth/guard";

export default async function ReportsLayout({
  children,
}: LayoutProps<"/reports">) {
  await requireUser();
  return <Container className="py-6">{children}</Container>;
}
```

- [ ] **Step 2: Create the date range bar**

`src/components/pages/reports/components/ReportDateRangeBar.tsx`:

```tsx
"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isValidIsoDate,
  RANGE_PRESET_LABELS,
  RANGE_PRESETS,
  type RangePreset,
} from "@/lib/utils/date-range";

export function ReportDateRangeBar({
  from,
  to,
  presets,
}: {
  from: string;
  to: string;
  /** Precomputed on the server so presets use the SHOP's today, not the browser's. */
  presets: Record<RangePreset, { from: string; to: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function apply(nextFrom: string, nextTo: string) {
    if (!isValidIsoDate(nextFrom) || !isValidIsoDate(nextTo)) return;
    // Swap rather than reject — the user clearly meant the range between them.
    const [start, end] =
      nextFrom <= nextTo ? [nextFrom, nextTo] : [nextTo, nextFrom];
    startTransition(() => {
      router.push(`${pathname}?from=${start}&to=${end}`);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {RANGE_PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => apply(presets[preset].from, presets[preset].to)}
          >
            {RANGE_PRESET_LABELS[preset]}
          </Button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="range-from" className="text-xs font-normal">
            From
          </Label>
          <Input
            id="range-from"
            type="date"
            value={from}
            className="w-40"
            disabled={isPending}
            onChange={(event) => apply(event.target.value, to)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="range-to" className="text-xs font-normal">
            To
          </Label>
          <Input
            id="range-to"
            type="date"
            value={to}
            className="w-40"
            disabled={isPending}
            onChange={(event) => apply(from, event.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
```

Native `<input type="date">` rather than the shadcn calendar: it is keyboard-friendly, needs no extra state, and gives the OS date picker on a tablet.

- [ ] **Step 3: Create the CSV export action**

`src/server/reports/reports-actions.ts`:

```ts
"use server";

import { guarded, requireUser } from "@/lib/auth/guard";
import { csvAmount, toCsv } from "@/lib/utils/csv";
import { isValidIsoDate } from "@/lib/utils/date-range";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { getItemSales, getSalesByDay } from "@/server/reports/reports-queries";

function validateRange(input: {
  from: string;
  to: string;
}): ActionResult<null> | null {
  if (!isValidIsoDate(input.from) || !isValidIsoDate(input.to)) {
    return fail<null>("VALIDATION", "Choose a valid date range.");
  }
  if (input.from > input.to) {
    return fail<null>(
      "VALIDATION",
      "The start date must be before the end date.",
    );
  }
  return null;
}

export async function exportSalesCsvAction(input: {
  from: string;
  to: string;
}): Promise<ActionResult<{ csv: string }>> {
  return guarded(async () => {
    await requireUser();

    const invalid = validateRange(input);
    if (invalid) return invalid as ActionResult<{ csv: string }>;

    const rows = await getSalesByDay(input.from, input.to);

    return ok({
      csv: toCsv(rows, [
        { header: "Date", value: (r) => r.businessDate },
        { header: "Bills", value: (r) => r.billCount },
        { header: "Gross", value: (r) => csvAmount(r.gross) },
        { header: "Discount", value: (r) => csvAmount(r.discount) },
        { header: "Net", value: (r) => csvAmount(r.net) },
      ]),
    });
  });
}

export async function exportItemsCsvAction(input: {
  from: string;
  to: string;
}): Promise<ActionResult<{ csv: string }>> {
  return guarded(async () => {
    await requireUser();

    const invalid = validateRange(input);
    if (invalid) return invalid as ActionResult<{ csv: string }>;

    const rows = await getItemSales(input.from, input.to);

    return ok({
      csv: toCsv(rows, [
        { header: "Item", value: (r) => r.itemName },
        { header: "Category", value: (r) => r.categoryName },
        { header: "Quantity", value: (r) => r.quantity },
        { header: "Revenue", value: (r) => csvAmount(r.revenue) },
        { header: "Share %", value: (r) => r.sharePercent },
      ]),
    });
  });
}
```

- [ ] **Step 4: Create the export button**

`src/components/pages/reports/components/ExportCsvButton.tsx`:

```tsx
"use client";

import { Download } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/utils/result";

export function ExportCsvButton({
  filename,
  onExport,
  disabled,
}: {
  filename: string;
  onExport: () => Promise<ActionResult<{ csv: string }>>;
  disabled?: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await onExport();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      const blob = new Blob([result.data.csv], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      toast.success("Export downloaded");
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled || isPending}
      onClick={handleClick}
    >
      <Download className="size-4" />
      {isPending ? "Preparing…" : "Export CSV"}
    </Button>
  );
}
```

- [ ] **Step 5: Verify the CSV opens correctly**

Deferred to Task 11 Step 3, where a real export can be downloaded and opened.

---

### Task 11: Sales report

**Files:**

- Create: `src/components/pages/reports/sales/SalesReportTab.tsx`, `SalesReportColumns.tsx`
- Create: `src/app/(app)/reports/sales/page.tsx`

**Interfaces:**

- Consumes: `getSalesByDay`, `getPaymentBreakdown`, `ReportDateRangeBar`, `ExportCsvButton`, `exportSalesCsvAction`
- Produces: a working `/reports/sales` route

- [ ] **Step 1: Create the columns**

`src/components/pages/reports/sales/SalesReportColumns.tsx`:

```tsx
import { TableCell, TableRow } from "@/components/ui/table";
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { SalesByDayRow } from "@/types/report.types";

export const SALES_HEADERS = [
  "Date",
  "Bills",
  "Gross",
  "Discount",
  "Net",
] as const;

export function SalesReportRow({ row }: { row: SalesByDayRow }) {
  return (
    <TableRow>
      <TableCell>{formatBillDate(row.businessDate)}</TableCell>
      <TableCell className="tabular-nums">{row.billCount}</TableCell>
      <TableCell className="tabular-nums">{formatINR(row.gross)}</TableCell>
      <TableCell className="tabular-nums">
        {isZero(row.discount) ? "—" : `-${formatINR(row.discount)}`}
      </TableCell>
      <TableCell className="font-semibold tabular-nums">
        {formatINR(row.net)}
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 2: Create the tab and route**

`src/components/pages/reports/sales/SalesReportTab.tsx`:

```tsx
"use client";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import type { RangePreset } from "@/lib/utils/date-range";
import { formatINR } from "@/lib/utils/money";
import { exportSalesCsvAction } from "@/server/reports/reports-actions";
import type { PaymentBreakdownRow, SalesByDayRow } from "@/types/report.types";

import { ExportCsvButton } from "../components/ExportCsvButton";
import { ReportDateRangeBar } from "../components/ReportDateRangeBar";
import { SALES_HEADERS, SalesReportRow } from "./SalesReportColumns";

export function SalesReportTab({
  from,
  to,
  presets,
  rows,
  payments,
}: {
  from: string;
  to: string;
  presets: Record<RangePreset, { from: string; to: string }>;
  rows: SalesByDayRow[];
  payments: PaymentBreakdownRow[];
}) {
  const totals = rows.reduce(
    (accumulator, row) => ({
      billCount: accumulator.billCount + row.billCount,
      gross: add(accumulator.gross, row.gross),
      discount: add(accumulator.discount, row.discount),
      net: add(accumulator.net, row.net),
    }),
    { billCount: 0, gross: ZERO, discount: ZERO, net: ZERO },
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sales</h1>
          <p className="text-sm text-muted-foreground">
            Takings per day. Voided bills are excluded.
          </p>
        </div>
        <ExportCsvButton
          filename={`sales-${from}-to-${to}.csv`}
          onExport={() => exportSalesCsvAction({ from, to })}
          disabled={rows.length === 0}
        />
      </div>

      <ReportDateRangeBar from={from} to={to} presets={presets} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Net takings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatINR(totals.net)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Bills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {totals.billCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Discounts given
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">
              {formatINR(totals.discount)}
            </p>
          </CardContent>
        </Card>
      </div>

      {payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>By payment method</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            {payments.map((payment) => (
              <div key={payment.paymentMethod}>
                <p className="text-xs text-muted-foreground">
                  {PAYMENT_METHOD_LABELS[payment.paymentMethod]}
                </p>
                <p className="text-lg font-semibold tabular-nums">
                  {formatINR(payment.net)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {payment.billCount} bill{payment.billCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <TableEmptyState
          title="No sales in this range"
          description="Try a wider date range."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {SALES_HEADERS.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <SalesReportRow key={row.businessDate} row={row} />
            ))}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCellTotals totals={totals} />
            </TableRow>
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function TableCellTotals({
  totals,
}: {
  totals: {
    billCount: number;
    gross: string;
    discount: string;
    net: string;
  };
}) {
  return (
    <>
      <TableCell>Total</TableCell>
      <TableCell className="tabular-nums">{totals.billCount}</TableCell>
      <TableCell className="tabular-nums">{formatINR(totals.gross)}</TableCell>
      <TableCell className="tabular-nums">
        {formatINR(totals.discount)}
      </TableCell>
      <TableCell className="tabular-nums">{formatINR(totals.net)}</TableCell>
    </>
  );
}
```

`src/app/(app)/reports/sales/page.tsx`:

```tsx
import { SalesReportTab } from "@/components/pages/reports/sales/SalesReportTab";
import {
  isValidIsoDate,
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
} from "@/lib/utils/date-range";
import {
  getPaymentBreakdown,
  getSalesByDay,
} from "@/server/reports/reports-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Sales report",
  description: "Takings per day over any date range.",
};

export default async function Page({
  searchParams,
}: PageProps<"/reports/sales">) {
  const params = await searchParams;
  const timeZone = await getShopTimezone();

  const fallback = presetRange("LAST_7", timeZone);
  const rawFrom = typeof params.from === "string" ? params.from : "";
  const rawTo = typeof params.to === "string" ? params.to : "";

  const from = isValidIsoDate(rawFrom) ? rawFrom : fallback.from;
  const to = isValidIsoDate(rawTo) ? rawTo : fallback.to;

  // Presets are computed server-side so they use the shop's today.
  const presets = Object.fromEntries(
    RANGE_PRESETS.map((preset) => [preset, presetRange(preset, timeZone)]),
  ) as Record<RangePreset, { from: string; to: string }>;

  const [rows, payments] = await Promise.all([
    getSalesByDay(from, to),
    getPaymentBreakdown(from, to),
  ]);

  return (
    <SalesReportTab
      from={from}
      to={to}
      presets={presets}
      rows={rows}
      payments={payments}
    />
  );
}
```

- [ ] **Step 3: Verify the sales report and its export**

```bash
npm run dev
```

At `/reports/sales`:

1. Defaults to the last 7 days; today's row shows the bills you created.
2. Click **Today** → range narrows; **Last 30 days** → widens.
3. Type an invalid date, e.g. clear the From field → the page does not crash and keeps the previous range.
4. Set From later than To → the range **swaps** rather than erroring.
5. Payment-method card totals equal the Net takings card.
6. The Total row equals the sum of the day rows.
7. **Export CSV** → a file downloads. Open it in Excel or Sheets:
   - Columns are Date, Bills, Gross, Discount, Net
   - Amounts read `140.00`, not `₹140.00` or `14000`
   - Any item name containing a comma stays in one cell

---

### Task 12: Item-wise report

**Files:**

- Create: `src/components/pages/reports/items/ItemReportTab.tsx`, `ItemReportColumns.tsx`
- Create: `src/app/(app)/reports/items/page.tsx`

**Interfaces:**

- Consumes: `getItemSales`, `ReportDateRangeBar`, `ExportCsvButton`, `exportItemsCsvAction`
- Produces: a working `/reports/items` route — **this is the client's "what is selling"**

- [ ] **Step 1: Create the columns**

`src/components/pages/reports/items/ItemReportColumns.tsx`:

```tsx
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatINR } from "@/lib/utils/money";
import type { ItemSalesRow } from "@/types/report.types";

export const ITEM_REPORT_HEADERS = [
  "Item",
  "Category",
  "Qty sold",
  "Revenue",
  "Share",
] as const;

export function ItemReportRow({ row }: { row: ItemSalesRow }) {
  return (
    <TableRow>
      <TableCell className="font-medium">{row.itemName}</TableCell>
      <TableCell>
        <Badge variant="secondary">{row.categoryName}</Badge>
      </TableCell>
      <TableCell className="tabular-nums">{row.quantity}</TableCell>
      <TableCell className="font-semibold tabular-nums">
        {formatINR(row.revenue)}
      </TableCell>
      <TableCell className="tabular-nums">
        <div className="flex items-center gap-2">
          <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary"
              style={{ width: `${Math.min(row.sharePercent, 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">
            {row.sharePercent}%
          </span>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 2: Create the tab and route**

`src/components/pages/reports/items/ItemReportTab.tsx`:

```tsx
"use client";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RangePreset } from "@/lib/utils/date-range";
import { exportItemsCsvAction } from "@/server/reports/reports-actions";
import type { ItemSalesRow } from "@/types/report.types";

import { ExportCsvButton } from "../components/ExportCsvButton";
import { ReportDateRangeBar } from "../components/ReportDateRangeBar";
import { ITEM_REPORT_HEADERS, ItemReportRow } from "./ItemReportColumns";

export function ItemReportTab({
  from,
  to,
  presets,
  rows,
}: {
  from: string;
  to: string;
  presets: Record<RangePreset, { from: string; to: string }>;
  rows: ItemSalesRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">What is selling</h1>
          <p className="text-sm text-muted-foreground">
            Ranked by revenue. Names and prices are as they were at the time of
            sale.
          </p>
        </div>
        <ExportCsvButton
          filename={`items-${from}-to-${to}.csv`}
          onExport={() => exportItemsCsvAction({ from, to })}
          disabled={rows.length === 0}
        />
      </div>

      <ReportDateRangeBar from={from} to={to} presets={presets} />

      {rows.length === 0 ? (
        <TableEmptyState
          title="No sales in this range"
          description="Try a wider date range."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              {ITEM_REPORT_HEADERS.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <ItemReportRow
                key={`${row.categoryName}-${row.itemName}`}
                row={row}
              />
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

`src/app/(app)/reports/items/page.tsx`:

```tsx
import { ItemReportTab } from "@/components/pages/reports/items/ItemReportTab";
import {
  isValidIsoDate,
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
} from "@/lib/utils/date-range";
import { getItemSales } from "@/server/reports/reports-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Item report",
  description: "Which items are selling.",
};

export default async function Page({
  searchParams,
}: PageProps<"/reports/items">) {
  const params = await searchParams;
  const timeZone = await getShopTimezone();

  const fallback = presetRange("LAST_30", timeZone);
  const rawFrom = typeof params.from === "string" ? params.from : "";
  const rawTo = typeof params.to === "string" ? params.to : "";

  const from = isValidIsoDate(rawFrom) ? rawFrom : fallback.from;
  const to = isValidIsoDate(rawTo) ? rawTo : fallback.to;

  const presets = Object.fromEntries(
    RANGE_PRESETS.map((preset) => [preset, presetRange(preset, timeZone)]),
  ) as Record<RangePreset, { from: string; to: string }>;

  const rows = await getItemSales(from, to);

  return <ItemReportTab from={from} to={to} presets={presets} rows={rows} />;
}
```

- [ ] **Step 3: Verify snapshots survive a rename — the audit-integrity test**

```bash
npm run dev
```

1. At `/reports/items`, note the revenue for **Veg Burger**.
2. Go to `/administration/items`, rename **Veg Burger** to **Classic Veg Burger** and change its price.
3. Return to `/reports/items` → **the row still reads "Veg Burger" at the old revenue.**

That is spec §6 Principle 2 working. If the row changed, a query is joining to `items` instead of reading the snapshot columns — find it and fix it.

4. Export CSV and confirm the same figures.

---

### Task 13: Bills ledger

**Files:**

- Modify: `src/server/bills/bills-queries.ts` (append `listBills`, `listCashiers`)
- Create: `src/components/pages/bills/BillsTab.tsx`, `BillsColumns.tsx`
- Create: `src/components/pages/bills/components/BillsTableToolbar.tsx`
- Create: `src/components/pages/bills/hooks/useBillsTab.ts`
- Create: `src/app/(app)/bills/page.tsx`

**Interfaces:**

- Consumes: `db`, `bills`, `billItems`, `users`, `useUrlPagination`, report types
- Produces:
  - `listBills(filters: BillLedgerFilters, page: number, pageSize: number): Promise<BillLedgerPage>`
  - `listCashiers(): Promise<Array<{ id: string; name: string }>>`
  - a working `/bills` route

- [ ] **Step 1: Append the ledger queries**

Append to `src/server/bills/bills-queries.ts`:

```ts
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";

import { withConnectionRetry } from "@/db/with-connection-retry";
import type {
  BillLedgerFilters,
  BillLedgerPage,
  BillLedgerRow,
} from "@/types/report.types";

export async function listCashiers(): Promise<
  Array<{ id: string; name: string }>
> {
  return withConnectionRetry(async () =>
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .orderBy(asc(users.name)),
  );
}

/**
 * The auditor's view: every bill, voided ones included, newest first.
 * Filtered and paginated in SQL — never fetch the whole table and slice it.
 */
export async function listBills(
  filters: BillLedgerFilters,
  page: number,
  pageSize: number,
): Promise<BillLedgerPage> {
  return withConnectionRetry(async () => {
    const conditions: SQL[] = [
      gte(bills.businessDate, filters.from),
      lte(bills.businessDate, filters.to),
    ];

    if (filters.cashierId)
      conditions.push(eq(bills.createdBy, filters.cashierId));
    if (filters.paymentMethod) {
      conditions.push(eq(bills.paymentMethod, filters.paymentMethod));
    }
    if (filters.billNumber !== undefined) {
      conditions.push(eq(bills.billNumber, filters.billNumber));
    }

    const where = and(...conditions);
    const offset = (page - 1) * pageSize;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: bills.id,
          billNumber: bills.billNumber,
          businessDate: bills.businessDate,
          createdAt: bills.createdAt,
          total: bills.total,
          paymentMethod: bills.paymentMethod,
          status: bills.status,
          cashierName: users.name,
          lineCount: sql<number>`
            (SELECT count(*)::int FROM ${billItems}
             WHERE ${billItems.billId} = ${bills.id})
          `,
        })
        .from(bills)
        .innerJoin(users, eq(users.id, bills.createdBy))
        .where(where)
        .orderBy(desc(bills.businessDate), desc(bills.billNumber))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(bills).where(where),
    ]);

    return {
      rows: rows as BillLedgerRow[],
      total: totalRow?.value ?? 0,
      page,
      pageSize,
    };
  });
}
```

Ensure `asc`, `sql`, `count` and `users` are imported at the top of the file.

- [ ] **Step 2: Create the columns**

`src/components/pages/bills/BillsColumns.tsx`:

```tsx
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { formatBillDate } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import type { BillLedgerRow } from "@/types/report.types";

export const BILL_HEADERS = [
  "Bill",
  "Date",
  "Cashier",
  "Items",
  "Payment",
  "Total",
  "Status",
] as const;

export function BillTableRow({ row }: { row: BillLedgerRow }) {
  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell>
        <Link
          href={REPORT_ROUTES.bill(row.id)}
          className="font-medium underline-offset-4 hover:underline"
        >
          #{row.billNumber}
        </Link>
      </TableCell>
      <TableCell>{formatBillDate(row.businessDate)}</TableCell>
      <TableCell>{row.cashierName}</TableCell>
      <TableCell className="tabular-nums">{row.lineCount}</TableCell>
      <TableCell>{PAYMENT_METHOD_LABELS[row.paymentMethod]}</TableCell>
      <TableCell className="font-semibold tabular-nums">
        {formatINR(row.total)}
      </TableCell>
      <TableCell>
        {row.status === "VOID" ? (
          <Badge variant="destructive">Void</Badge>
        ) : (
          <Badge variant="secondary">Completed</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 3: Create the toolbar and hook**

`src/components/pages/bills/hooks/useBillsTab.ts`:

```ts
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

export function useBillsTab() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  /** Any filter change resets to page 1 — page 4 of a new filter is meaningless. */
  const setFilter = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null || value === "" || value === "ALL") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      params.set("page", "1");
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams],
  );

  const goToPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("page", String(page));
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    },
    [pathname, router, searchParams],
  );

  return { isPending, setFilter, goToPage };
}
```

`src/components/pages/bills/components/BillsTableToolbar.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
} from "@/constants/payment-methods";

export function BillsTableToolbar({
  from,
  to,
  cashierId,
  paymentMethod,
  billNumber,
  cashiers,
  onFilterChange,
  disabled,
}: {
  from: string;
  to: string;
  cashierId: string;
  paymentMethod: string;
  billNumber: string;
  cashiers: Array<{ id: string; name: string }>;
  onFilterChange: (key: string, value: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="bills-from" className="text-xs font-normal">
          From
        </Label>
        <Input
          id="bills-from"
          type="date"
          value={from}
          className="w-40"
          disabled={disabled}
          onChange={(event) => onFilterChange("from", event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="bills-to" className="text-xs font-normal">
          To
        </Label>
        <Input
          id="bills-to"
          type="date"
          value={to}
          className="w-40"
          disabled={disabled}
          onChange={(event) => onFilterChange("to", event.target.value)}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-normal">Cashier</Label>
        <Select
          value={cashierId || "ALL"}
          disabled={disabled}
          onValueChange={(value) => onFilterChange("cashierId", value)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All cashiers</SelectItem>
            {cashiers.map((cashier) => (
              <SelectItem key={cashier.id} value={cashier.id}>
                {cashier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-normal">Payment</Label>
        <Select
          value={paymentMethod || "ALL"}
          disabled={disabled}
          onValueChange={(value) => onFilterChange("paymentMethod", value)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All methods</SelectItem>
            {PAYMENT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {PAYMENT_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="bills-number" className="text-xs font-normal">
          Bill #
        </Label>
        <Input
          id="bills-number"
          inputMode="numeric"
          value={billNumber}
          placeholder="Any"
          className="w-24"
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "" || /^\d{0,6}$/.test(next)) {
              onFilterChange("billNumber", next || null);
            }
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the tab and route**

`src/components/pages/bills/BillsTab.tsx`:

```tsx
"use client";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BillLedgerPage } from "@/types/report.types";

import { BILL_HEADERS, BillTableRow } from "./BillsColumns";
import { BillsTableToolbar } from "./components/BillsTableToolbar";
import { useBillsTab } from "./hooks/useBillsTab";

export function BillsTab({
  ledger,
  filters,
  cashiers,
}: {
  ledger: BillLedgerPage;
  filters: {
    from: string;
    to: string;
    cashierId: string;
    paymentMethod: string;
    billNumber: string;
  };
  cashiers: Array<{ id: string; name: string }>;
}) {
  const tab = useBillsTab();

  const lastPage = Math.max(1, Math.ceil(ledger.total / ledger.pageSize));
  const firstRow =
    ledger.total === 0 ? 0 : (ledger.page - 1) * ledger.pageSize + 1;
  const lastRow = Math.min(ledger.page * ledger.pageSize, ledger.total);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bills</h1>
        <p className="text-sm text-muted-foreground">
          Every bill ever issued, including voided ones.
        </p>
      </div>

      <BillsTableToolbar
        {...filters}
        cashiers={cashiers}
        onFilterChange={tab.setFilter}
        disabled={tab.isPending}
      />

      {ledger.rows.length === 0 ? (
        <TableEmptyState
          title="No bills match"
          description="Try widening the date range or clearing a filter."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {BILL_HEADERS.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.rows.map((row) => (
                <BillTableRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {firstRow}–{lastRow} of {ledger.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={ledger.page <= 1 || tab.isPending}
                onClick={() => tab.goToPage(ledger.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={ledger.page >= lastPage || tab.isPending}
                onClick={() => tab.goToPage(ledger.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

`src/app/(app)/bills/page.tsx`:

```tsx
import { Container } from "@/components/layout/Container";
import { BillsTab } from "@/components/pages/bills/BillsTab";
import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { requireUser } from "@/lib/auth/guard";
import { isValidIsoDate, presetRange } from "@/lib/utils/date-range";
import { listBills, listCashiers } from "@/server/bills/bills-queries";
import { getShopTimezone } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Bills",
  description: "Every bill issued.",
};

const PAGE_SIZE = 25;

export default async function Page({ searchParams }: PageProps<"/bills">) {
  await requireUser();

  const params = await searchParams;
  const timeZone = await getShopTimezone();
  const fallback = presetRange("LAST_30", timeZone);

  const read = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";

  const from = isValidIsoDate(read("from")) ? read("from") : fallback.from;
  const to = isValidIsoDate(read("to")) ? read("to") : fallback.to;
  const cashierId = read("cashierId");
  const paymentRaw = read("paymentMethod");
  const paymentMethod = PAYMENT_METHODS.includes(paymentRaw as PaymentMethod)
    ? (paymentRaw as PaymentMethod)
    : undefined;
  const billNumberRaw = read("billNumber");
  const billNumber = /^\d+$/.test(billNumberRaw)
    ? Number(billNumberRaw)
    : undefined;
  const page = Math.max(1, Number(read("page")) || 1);

  const [ledger, cashiers] = await Promise.all([
    listBills(
      {
        from,
        to,
        cashierId: cashierId || undefined,
        paymentMethod,
        billNumber,
      },
      page,
      PAGE_SIZE,
    ),
    listCashiers(),
  ]);

  return (
    <Container className="py-6">
      <BillsTab
        ledger={ledger}
        filters={{
          from,
          to,
          cashierId,
          paymentMethod: paymentMethod ?? "",
          billNumber: billNumberRaw,
        }}
        cashiers={cashiers}
      />
    </Container>
  );
}
```

- [ ] **Step 5: Verify the ledger**

Generate enough bills to page through:

```bash
npx tsx --env-file=.env.local -e "
import { createBill } from './src/server/bills/create-bill-service';
import { getMenu } from './src/server/items/items-queries';
import { multiply } from './src/lib/utils/money';
import { db } from './src/db';
import { sql } from 'drizzle-orm';
const [{ id: userId }] = (await db.execute(sql\`SELECT id FROM users WHERE role='SUPERADMIN' LIMIT 1\`)).rows;
const menu = await getMenu();
const item = menu[0].items[0];
for (let i = 0; i < 30; i++) {
  const r = await createBill({
    idempotencyKey: crypto.randomUUID(),
    lines: [{ itemId: item.id, quantity: (i % 3) + 1 }],
    discount: '0.00',
    paymentMethod: ['CASH','UPI','CARD'][i % 3],
    tendered: null,
    expectedTotal: multiply(item.price, (i % 3) + 1),
  }, userId);
  if (!r.ok) { console.error(r.error); break; }
}
console.log('created 30 bills');
process.exit(0);
"
```

Then at `/bills`:

1. Newest bills first; the count reads "Showing 1–25 of 3x".
2. **Next** → page 2; the URL carries `?page=2` and is reloadable.
3. Filter by **Payment → UPI** → only UPI bills, and the page resets to 1.
4. Enter a **Bill #** → exactly one row.
5. Filter by **Cashier** → works.
6. Click a bill number → navigates to the detail page (Task 14 — a 404 until then).

---

### Task 14: Bill detail and reprint

**Files:**

- Modify: `src/server/bills/bills-actions.ts` (append `reprintBillAction`)
- Create: `src/components/pages/bills/bill-details/BillDetails.tsx`
- Create: `src/app/(app)/bills/[billId]/page.tsx`

**Interfaces:**

- Consumes: `getReceipt`, `writeAuditLog`, `guarded`, `requireUser`
- Produces:
  - `reprintBillAction({ billId }): Promise<ActionResult<null>>` — logs `BILL_REPRINTED`
  - a working `/bills/[billId]` route

- [ ] **Step 1: Append the reprint action**

Append to `src/server/bills/bills-actions.ts`:

```ts
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { bills } from "@/db/schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";

/**
 * Records that a receipt was reprinted, then the caller opens /print/[id].
 *
 * Without this, "reprint" is an untraceable way to hand out a second copy of a
 * receipt. See spec §9.
 */
export async function reprintBillAction(payload: {
  billId: string;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const user = await requireUser();

    const bill = await db.query.bills.findFirst({
      where: eq(bills.id, payload.billId),
      columns: { id: true, billNumber: true, businessDate: true },
    });
    if (!bill) return fail<null>("NOT_FOUND", "That bill no longer exists.");

    await writeAuditLog({
      actorId: user.id,
      action: "BILL_REPRINTED",
      entityType: "bill",
      entityId: bill.id,
      after: { billNumber: bill.billNumber, businessDate: bill.businessDate },
    });

    return ok(null);
  });
}
```

Add `ok` to the existing `@/lib/utils/result` import in that file.

- [ ] **Step 2: Create the detail component**

`src/components/pages/bills/bill-details/BillDetails.tsx`:

```tsx
"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import { formatBillDate, formatBillTime } from "@/lib/utils/dates";
import { formatINR } from "@/lib/utils/money";
import { reprintBillAction } from "@/server/bills/bills-actions";
import type { ReceiptData } from "@/types/bill.types";

export function BillDetails({
  billId,
  receipt,
  status,
}: {
  billId: string;
  receipt: ReceiptData;
  status: "COMPLETED" | "VOID";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleReprint() {
    startTransition(async () => {
      const result = await reprintBillAction({ billId });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      // The reprint is logged before the print view opens.
      router.push(REPORT_ROUTES.print(billId));
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href={REPORT_ROUTES.bills} aria-label="Back to bills">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold">
              Bill #{receipt.billNumber}
              {status === "VOID" ? <Badge variant="destructive">Void</Badge> : null}
            </h1>
            <p className="text-muted-foreground text-sm">
              {formatBillDate(receipt.businessDate)} at{" "}
              {formatBillTime(receipt.createdAt, receipt.shop.timezone)} · billed by{" "}
              {receipt.cashierName}
            </p>
          </div>
        </div>

        <Button onClick={handleReprint} disabled={isPending}>
          <Printer className="size-4" />
          {isPending ? "Opening…" : "Reprint"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipt.lines.map((line, index) => (
                <TableRow key={`${line.itemName}-${index}`}>
                  <TableCell className="font-medium">{line.itemName}</TableCell>
                  <TableCell className="tabular-nums">
                    {formatINR(line.unitPrice)}
                  </TableCell>
                  <TableCell className="tabular-nums">{line.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatINR(line.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Separator />

          <dl className="ml-auto max-w-xs space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{formatINR(receipt.subtotal)}</dd>
            </div>
            {isZero(receipt.discount) ? null : (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular-nums">
                  -{formatINR(receipt.discount)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatINR(receipt.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Paid by</dt>
              <dd>{PAYMENT_METHOD_LABELS[receipt.paymentMethod]}</dd>
            </div>
            {receipt.tendered !== null ? (
              <>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tendered</dt>
                  <dd className="tabular-nums">
                    {formatINR(receipt.tendered)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Change</dt>
                  <dd className="tabular-nums">
                    {formatINR(receipt.changeDue ?? 0)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Item names and prices are exactly as they were when this bill was
        issued. Later menu changes do not affect this record.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create the route**

`src/app/(app)/bills/[billId]/page.tsx`:

```tsx
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

import { Container } from "@/components/layout/Container";
import { BillDetails } from "@/components/pages/bills/bill-details/BillDetails";
import { db } from "@/db";
import { bills } from "@/db/schema";
import { requireUser } from "@/lib/auth/guard";
import { getReceipt } from "@/server/bills/bills-queries";

export const metadata = {
  title: "Bill",
  description: "A single bill in full.",
};

export default async function Page({ params }: PageProps<"/bills/[billId]">) {
  await requireUser();

  const { billId } = await params;

  const [receipt, statusRow] = await Promise.all([
    getReceipt(billId),
    db.query.bills.findFirst({
      where: eq(bills.id, billId),
      columns: { status: true },
    }),
  ]);

  if (!receipt || !statusRow) notFound();

  return (
    <Container className="py-6">
      <BillDetails
        billId={billId}
        receipt={receipt}
        status={statusRow.status}
      />
    </Container>
  );
}
```

- [ ] **Step 4: Verify detail and reprint logging — M5's gate**

```bash
npm run dev
```

1. From `/bills`, click a bill number → the detail page shows every line with unit prices, subtotal, discount, total, tendered and change.
2. Click **Reprint** → the print view opens and auto-prints.
3. Confirm the reprint was logged:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`SELECT action, entity_id, after, created_at FROM audit_log WHERE action='BILL_REPRINTED' ORDER BY created_at DESC LIMIT 3\`);
console.table(r.rows);
process.exit(0);
"
```

Expected: a `BILL_REPRINTED` row naming the bill number. **If this is empty, reprints are untraceable** — check that `reprintBillAction` runs before the navigation.

4. Visit `/bills/00000000-0000-0000-0000-000000000000` → a 404 page, not a crash.

```bash
npm run verify:all && npm run verify:reports && npm run verify:report-queries
npx tsc --noEmit && npm run lint && npm run build
```

---

# M6 — Users, Settings and Audit

### Task 15: User queries and actions

**Files:**

- Create: `src/server/users/users-queries.ts`, `users-actions.ts`
- Modify: `src/lib/validation/user-schema.ts` (append create/reset schemas)
- Create: `src/types/user.types.ts`

**Interfaces:**

- Consumes: `db`, `users`, `hashPassword`, `guarded`, `requireSuperadmin`, `writeAuditLog`
- Produces:
  - `listUsers(): Promise<UserRow[]>`
  - `createUserAction(input): Promise<ActionResult<{ id: string }>>`
  - `setUserActiveAction({ id, isActive }): Promise<ActionResult<null>>`
  - `resetPasswordAction({ id, password }): Promise<ActionResult<null>>`
  - `createUserSchema`, `resetPasswordSchema`

- [ ] **Step 1: Create the types and schemas**

`src/types/user.types.ts`:

```ts
import type { Role } from "@/constants/roles";

export type UserRow = {
  id: string;
  username: string;
  name: string;
  role: Role;
  isActive: boolean;
  lockedUntil: Date | null;
  createdAt: Date;
  /** Bills this user has created. Shown so deactivation is an informed choice. */
  billCount: number;
};
```

Append to `src/lib/validation/user-schema.ts`:

```ts
import { ROLES } from "@/constants/roles";

export const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be 32 characters or fewer")
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      "Use only letters, numbers, dots, dashes and underscores",
    ),
  name: z.string().trim().min(1, "Name is required").max(60),
  role: z.enum(ROLES),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    ),
});

export const resetPasswordSchema = z.object({
  id: z.uuid(),
  password: z
    .string()
    .min(
      MIN_PASSWORD_LENGTH,
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    ),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
```

- [ ] **Step 2: Create the queries**

`src/server/users/users-queries.ts`:

```ts
import { and, asc, eq, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { bills, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type { UserRow } from "@/types/user.types";

export async function listUsers(): Promise<UserRow[]> {
  return withConnectionRetry(async () =>
    db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        role: users.role,
        isActive: users.isActive,
        lockedUntil: users.lockedUntil,
        createdAt: users.createdAt,
        billCount: sql<number>`
          (SELECT count(*)::int FROM ${bills} WHERE ${bills.createdBy} = ${users.id})
        `,
      })
      .from(users)
      .orderBy(asc(users.name)),
  );
}

/**
 * Enforces "there must always be one active superadmin".
 *
 * Counts only ACTIVE ones — a deactivated owner cannot sign in, so counting
 * them would let the shop lock itself out entirely. Drizzle drops `undefined`
 * conditions inside `and()`, so the optional exclusion needs no branching.
 */
export async function countActiveSuperadmins(
  excludingId?: string,
): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(
      and(
        eq(users.role, "SUPERADMIN"),
        eq(users.isActive, true),
        excludingId ? ne(users.id, excludingId) : undefined,
      ),
    );
  return row?.n ?? 0;
}
```

- [ ] **Step 3: Create the actions**

`src/server/users/users-actions.ts`:

```ts
"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import {
  createUserSchema,
  resetPasswordSchema,
} from "@/lib/validation/user-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";
import { countActiveSuperadmins } from "@/server/users/users-queries";

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) fields[issue.path.join(".")] = issue.message;
  return fields;
}

export async function createUserAction(
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    const parsed = createUserSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<{ id: string }>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error.issues),
      );
    }

    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.username}) = lower(${parsed.data.username})`)
      .limit(1);

    if (existing) {
      return fail<{ id: string }>(
        "CONFLICT",
        "That username is already taken.",
        {
          username: "Already taken",
        },
      );
    }

    const [created] = await db
      .insert(users)
      .values({
        username: parsed.data.username,
        name: parsed.data.name,
        role: parsed.data.role,
        passwordHash: await hashPassword(parsed.data.password),
        createdBy: actor.id,
      })
      .returning({ id: users.id });

    // The password is never logged, in any form.
    await writeAuditLog({
      actorId: actor.id,
      action: "USER_CREATED",
      entityType: "user",
      entityId: created.id,
      after: {
        username: parsed.data.username,
        name: parsed.data.name,
        role: parsed.data.role,
      },
    });

    revalidatePath(ADMIN_ROUTES.users);
    return ok(created);
  });
}

export async function setUserActiveAction(payload: {
  id: string;
  isActive: boolean;
}): Promise<ActionResult<null>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    if (payload.id === actor.id && !payload.isActive) {
      return fail<null>("CONFLICT", "You cannot deactivate your own account.");
    }

    const before = await db.query.users.findFirst({
      where: eq(users.id, payload.id),
    });
    if (!before) return fail<null>("NOT_FOUND", "That user no longer exists.");

    // Never leave the shop with no way in.
    if (!payload.isActive && before.role === "SUPERADMIN") {
      const remaining = await countActiveSuperadmins(payload.id);
      if (remaining === 0) {
        return fail<null>(
          "CONFLICT",
          "This is the last active owner account. Create another owner first.",
        );
      }
    }

    await db
      .update(users)
      .set({
        isActive: payload.isActive,
        // Reactivating clears any lockout so they can sign straight in.
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, payload.id));

    await writeAuditLog({
      actorId: actor.id,
      action: payload.isActive ? "USER_UPDATED" : "USER_DEACTIVATED",
      entityType: "user",
      entityId: payload.id,
      before: { isActive: before.isActive },
      after: { isActive: payload.isActive },
    });

    revalidatePath(ADMIN_ROUTES.users);
    return ok(null);
  });
}

export async function resetPasswordAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    const parsed = resetPasswordSchema.safeParse(payload);
    if (!parsed.success) {
      return fail<null>(
        "VALIDATION",
        "Check the highlighted fields.",
        fieldErrors(parsed.error.issues),
      );
    }

    const before = await db.query.users.findFirst({
      where: eq(users.id, parsed.data.id),
    });
    if (!before) return fail<null>("NOT_FOUND", "That user no longer exists.");

    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(parsed.data.password),
        failedAttempts: 0,
        lockedUntil: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, parsed.data.id));

    // Records THAT it happened, never the password itself.
    await writeAuditLog({
      actorId: actor.id,
      action: "USER_PASSWORD_RESET",
      entityType: "user",
      entityId: parsed.data.id,
      after: { username: before.username },
    });

    revalidatePath(ADMIN_ROUTES.users);
    return ok(null);
  });
}
```

- [ ] **Step 4: Verify the account invariants**

Create `scripts/verify-users.ts`:

```ts
import { eq, sql } from "drizzle-orm";

import { db } from "../src/db";
import { users } from "../src/db/schema";
import { hashPassword, verifyPassword } from "../src/lib/auth/password";
import { countActiveSuperadmins } from "../src/server/users/users-queries";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  const activeOwners = await countActiveSuperadmins();
  check(
    "at least one active superadmin exists",
    activeOwners >= 1,
    activeOwners,
  );

  check(
    "excluding the only owner leaves zero",
    (await countActiveSuperadmins(
      (
        await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.role, "SUPERADMIN"))
          .limit(1)
      )[0].id,
    )) ===
      activeOwners - 1,
  );

  // A deactivated user must not be counted.
  await db.execute(sql`DELETE FROM users WHERE username = 'invariant-probe'`);
  const [probe] = await db
    .insert(users)
    .values({
      username: "invariant-probe",
      name: "Probe",
      role: "SUPERADMIN",
      passwordHash: await hashPassword("Probe@12345"),
    })
    .returning({ id: users.id });

  const withProbe = await countActiveSuperadmins();
  await db.update(users).set({ isActive: false }).where(eq(users.id, probe.id));
  const withoutProbe = await countActiveSuperadmins();

  check(
    "a deactivated superadmin is not counted as active",
    withoutProbe === withProbe - 1,
    { withProbe, withoutProbe },
  );

  // A reset must actually change the hash and invalidate the old password.
  const oldHash = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!.passwordHash;
  await db
    .update(users)
    .set({ passwordHash: await hashPassword("NewProbe@123") })
    .where(eq(users.id, probe.id));
  const newHash = (await db.query.users.findFirst({
    where: eq(users.id, probe.id),
  }))!.passwordHash;

  check("a password reset changes the stored hash", oldHash !== newHash);
  check(
    "the old password no longer verifies",
    !(await verifyPassword("Probe@12345", newHash)),
  );
  check(
    "the new password verifies",
    await verifyPassword("NewProbe@123", newHash),
  );

  await db.execute(sql`DELETE FROM users WHERE username = 'invariant-probe'`);

  console.log(
    failures === 0 ? "\nAll user checks passed." : `\n${failures} FAILURE(S)`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`: `"verify:users": "tsx --env-file=.env.local scripts/verify-users.ts"`

```bash
npm run verify:users
```

Expected: six `PASS` lines.

---

### Task 16: User management UI

**Files:**

- Create: `src/components/pages/administration/users/UsersTab.tsx`, `UsersColumns.tsx`
- Create: `src/components/pages/administration/users/create-user-dialog/CreateUserDialog.tsx`
- Create: `src/components/pages/administration/users/reset-password-dialog/ResetPasswordDialog.tsx`
- Create: `src/components/pages/administration/users/hooks/useUsersTab.ts`
- Create: `src/app/(app)/administration/users/page.tsx`

**Interfaces:**

- Consumes: `listUsers`, the three user actions, `ConfirmDialog`
- Produces: a working `/administration/users` route

- [ ] **Step 1: Create the hook**

`src/components/pages/administration/users/hooks/useUsersTab.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import type { Role } from "@/constants/roles";
import {
  createUserAction,
  resetPasswordAction,
  setUserActiveAction,
} from "@/server/users/users-actions";
import type { UserRow } from "@/types/user.types";

export type CreateUserFormState = {
  username: string;
  name: string;
  role: Role;
  password: string;
};

const EMPTY_USER: CreateUserFormState = {
  username: "",
  name: "",
  role: "ADMIN",
  password: "",
};

export function useUsersTab() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<CreateUserFormState>(EMPTY_USER);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [resetTarget, setResetTarget] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [toggleTarget, setToggleTarget] = useState<UserRow | null>(null);

  const openCreate = useCallback(() => {
    setForm(EMPTY_USER);
    setFieldErrors({});
    setCreateOpen(true);
  }, []);

  const submitCreate = useCallback(() => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await createUserAction(form);
      if (result.ok) {
        toast.success(`${form.name} can now sign in as ${form.username}`);
        setCreateOpen(false);
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router]);

  const submitReset = useCallback(() => {
    if (!resetTarget) return;
    setFieldErrors({});

    startTransition(async () => {
      const result = await resetPasswordAction({
        id: resetTarget.id,
        password: newPassword,
      });
      if (result.ok) {
        toast.success(`Password reset for ${resetTarget.name}`);
        setResetTarget(null);
        setNewPassword("");
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [newPassword, resetTarget, router]);

  const confirmToggle = useCallback(() => {
    if (!toggleTarget) return;
    const target = toggleTarget;

    startTransition(async () => {
      const result = await setUserActiveAction({
        id: target.id,
        isActive: !target.isActive,
      });
      if (result.ok) {
        toast.success(
          target.isActive
            ? `${target.name} can no longer sign in`
            : `${target.name} can sign in again`,
        );
      } else {
        toast.error(result.error.message);
      }
      setToggleTarget(null);
      router.refresh();
    });
  }, [router, toggleTarget]);

  return {
    isPending,
    createOpen,
    setCreateOpen,
    form,
    setForm,
    fieldErrors,
    openCreate,
    submitCreate,
    resetTarget,
    setResetTarget,
    newPassword,
    setNewPassword,
    submitReset,
    toggleTarget,
    setToggleTarget,
    confirmToggle,
  };
}
```

- [ ] **Step 2: Create the columns**

`src/components/pages/administration/users/UsersColumns.tsx`:

```tsx
"use client";

import { KeyRound, UserCheck, UserX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { ROLE_LABELS } from "@/constants/roles";
import type { UserRow } from "@/types/user.types";

export const USER_HEADERS = [
  "Name",
  "Username",
  "Role",
  "Bills",
  "Status",
  "",
] as const;

export function UserTableRow({
  row,
  currentUserId,
  onReset,
  onToggle,
  disabled,
}: {
  row: UserRow;
  currentUserId: string;
  onReset: (row: UserRow) => void;
  onToggle: (row: UserRow) => void;
  disabled: boolean;
}) {
  const isSelf = row.id === currentUserId;
  const isLocked = row.lockedUntil !== null && row.lockedUntil > new Date();

  return (
    <TableRow className={row.isActive ? "" : "opacity-60"}>
      <TableCell className="font-medium">
        {row.name}
        {isSelf ? (
          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
        ) : null}
      </TableCell>
      <TableCell className="font-mono text-sm">{row.username}</TableCell>
      <TableCell>
        <Badge variant={row.role === "SUPERADMIN" ? "default" : "secondary"}>
          {ROLE_LABELS[row.role]}
        </Badge>
      </TableCell>
      <TableCell className="tabular-nums">{row.billCount}</TableCell>
      <TableCell>
        {!row.isActive ? (
          <Badge variant="outline">Deactivated</Badge>
        ) : isLocked ? (
          <Badge variant="destructive">Locked</Badge>
        ) : (
          <Badge variant="secondary">Active</Badge>
        )}
      </TableCell>
      <TableCell className="text-right">
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label={`Reset password for ${row.name}`}
          onClick={() => onReset(row)}
        >
          <KeyRound className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled || isSelf}
          aria-label={
            row.isActive ? `Deactivate ${row.name}` : `Reactivate ${row.name}`
          }
          onClick={() => onToggle(row)}
        >
          {row.isActive ? (
            <UserX className="size-4 text-destructive" />
          ) : (
            <UserCheck className="size-4" />
          )}
        </Button>
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 3: Create the dialogs**

`src/components/pages/administration/users/create-user-dialog/CreateUserDialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_LABELS, ROLES, type Role } from "@/constants/roles";

import type { CreateUserFormState } from "../hooks/useUsersTab";

export function CreateUserDialog({
  open,
  onOpenChange,
  form,
  setForm,
  fieldErrors,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: CreateUserFormState;
  setForm: (next: CreateUserFormState) => void;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            Give the person their username and password directly — there is no
            email invitation.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="user-name">Full name</Label>
            <Input
              id="user-name"
              value={form.name}
              autoFocus
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.name)}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Printed on every receipt this person creates.
            </p>
            {fieldErrors.name ? (
              <p className="text-sm text-destructive">{fieldErrors.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-username">Username</Label>
            <Input
              id="user-username"
              value={form.username}
              autoComplete="off"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.username)}
              onChange={(event) =>
                setForm({ ...form, username: event.target.value })
              }
            />
            {fieldErrors.username ? (
              <p className="text-sm text-destructive">{fieldErrors.username}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-role">Role</Label>
            <Select
              value={form.role}
              disabled={isPending}
              onValueChange={(value) =>
                setForm({ ...form, role: value as Role })
              }
            >
              <SelectTrigger id="user-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Cashiers can bill and view reports. Owners can also change the
              menu, prices and accounts.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">Password</Label>
            <Input
              id="user-password"
              type="password"
              value={form.password}
              autoComplete="new-password"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(event) =>
                setForm({ ...form, password: event.target.value })
              }
            />
            {fieldErrors.password ? (
              <p className="text-sm text-destructive">{fieldErrors.password}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/pages/administration/users/reset-password-dialog/ResetPasswordDialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { UserRow } from "@/types/user.types";

export function ResetPasswordDialog({
  target,
  onOpenChange,
  password,
  setPassword,
  fieldErrors,
  onSubmit,
  isPending,
}: {
  target: UserRow | null;
  onOpenChange: (open: boolean) => void;
  password: string;
  setPassword: (value: string) => void;
  fieldErrors: Record<string, string>;
  onSubmit: () => void;
  isPending: boolean;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset password</DialogTitle>
          <DialogDescription>
            Set a new password for {target?.name}. Tell them directly — it is
            not sent anywhere. This also clears any lockout.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="reset-password">New password</Label>
            <Input
              id="reset-password"
              type="password"
              value={password}
              autoFocus
              autoComplete="new-password"
              disabled={isPending}
              aria-invalid={Boolean(fieldErrors.password)}
              onChange={(event) => setPassword(event.target.value)}
            />
            {fieldErrors.password ? (
              <p className="text-sm text-destructive">{fieldErrors.password}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Create the tab and route**

`src/components/pages/administration/users/UsersTab.tsx`:

```tsx
"use client";

import { Plus } from "lucide-react";

import { ConfirmDialog } from "@/components/custom/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { UserRow } from "@/types/user.types";

import { CreateUserDialog } from "./create-user-dialog/CreateUserDialog";
import { useUsersTab } from "./hooks/useUsersTab";
import { ResetPasswordDialog } from "./reset-password-dialog/ResetPasswordDialog";
import { USER_HEADERS, UserTableRow } from "./UsersColumns";

export function UsersTab({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const tab = useUsersTab();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Who can sign in. Accounts are deactivated, never deleted — bills
            reference them.
          </p>
        </div>
        <Button onClick={tab.openCreate}>
          <Plus className="size-4" />
          New account
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {USER_HEADERS.map((header, index) => (
              <TableHead
                key={header || `col-${index}`}
                className={
                  index === USER_HEADERS.length - 1 ? "text-right" : ""
                }
              >
                {header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((row) => (
            <UserTableRow
              key={row.id}
              row={row}
              currentUserId={currentUserId}
              onReset={tab.setResetTarget}
              onToggle={tab.setToggleTarget}
              disabled={tab.isPending}
            />
          ))}
        </TableBody>
      </Table>

      <CreateUserDialog
        open={tab.createOpen}
        onOpenChange={tab.setCreateOpen}
        form={tab.form}
        setForm={tab.setForm}
        fieldErrors={tab.fieldErrors}
        onSubmit={tab.submitCreate}
        isPending={tab.isPending}
      />

      <ResetPasswordDialog
        target={tab.resetTarget}
        onOpenChange={(open) => {
          if (!open) {
            tab.setResetTarget(null);
            tab.setNewPassword("");
          }
        }}
        password={tab.newPassword}
        setPassword={tab.setNewPassword}
        fieldErrors={tab.fieldErrors}
        onSubmit={tab.submitReset}
        isPending={tab.isPending}
      />

      <ConfirmDialog
        open={tab.toggleTarget !== null}
        onOpenChange={(open) => {
          if (!open) tab.setToggleTarget(null);
        }}
        title={
          tab.toggleTarget?.isActive
            ? `Deactivate ${tab.toggleTarget?.name}?`
            : `Reactivate ${tab.toggleTarget?.name}?`
        }
        description={
          tab.toggleTarget?.isActive
            ? "They will not be able to sign in. Their past bills are unaffected and stay in the ledger under their name."
            : "They will be able to sign in again, and any lockout is cleared."
        }
        confirmLabel={tab.toggleTarget?.isActive ? "Deactivate" : "Reactivate"}
        destructive={tab.toggleTarget?.isActive}
        isPending={tab.isPending}
        onConfirm={tab.confirmToggle}
      />
    </div>
  );
}
```

`src/app/(app)/administration/users/page.tsx`:

```tsx
import { UsersTab } from "@/components/pages/administration/users/UsersTab";
import { requireSuperadmin } from "@/lib/auth/guard";
import { listUsers } from "@/server/users/users-queries";

export const metadata = {
  title: "Accounts",
  description: "Manage who can sign in.",
};

export default async function Page() {
  const actor = await requireSuperadmin();
  const users = await listUsers();

  return <UsersTab users={users} currentUserId={actor.id} />;
}
```

- [ ] **Step 5: Verify the account flows**

```bash
npm run dev
```

At `/administration/users`:

1. `owner` and `cashier` are listed with roles and bill counts.
2. Your own row shows **(you)** and its deactivate button is **disabled**.
3. **New account** → create `cashier2` / "Second Cashier" / Cashier / a password → appears in the table.
4. Sign out, sign in as `cashier2` → lands on `/bill`. Sign back in as `owner`.
5. **Reset password** for `cashier2` → sign in with the new one → works; the old one is rejected.
6. **Deactivate** `cashier2` → confirm → row greys out. Try to sign in as `cashier2` → rejected with the generic message.
7. **Reactivate** → sign in works again.
8. Try to deactivate `owner` while it is the only active owner → **refused** with "This is the last active owner account."
9. Check nothing sensitive was logged:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`SELECT action, after FROM audit_log WHERE action IN ('USER_CREATED','USER_PASSWORD_RESET','USER_DEACTIVATED') ORDER BY created_at DESC LIMIT 5\`);
console.log(JSON.stringify(r.rows, null, 2));
process.exit(0);
"
```

Expected: entries exist, and **no `password` or `passwordHash` field appears anywhere**. If one does, fix it before going further — the audit log is readable by every superadmin.

---

### Task 17: Shop settings

**Files:**

- Create: `src/server/settings/settings-actions.ts`
- Create: `src/lib/validation/settings-schema.ts`
- Create: `src/components/pages/administration/settings/ShopSettingsTab.tsx`
- Create: `src/components/pages/administration/settings/components/ReceiptPreview.tsx`
- Create: `src/components/pages/administration/settings/hooks/useShopSettingsTab.ts`
- Create: `src/app/(app)/administration/settings/page.tsx`

**Interfaces:**

- Consumes: `getShopSettings`, `guarded`, `requireSuperadmin`, `writeAuditLog`, `Receipt80mm`
- Produces:
  - `updateSettingsAction(input): Promise<ActionResult<null>>`
  - `settingsSchema`
  - a working `/administration/settings` route

- [ ] **Step 1: Create the schema**

`src/lib/validation/settings-schema.ts`:

```ts
import { z } from "zod";

export const PRINTER_WIDTHS = ["MM_80", "MM_58"] as const;
export type PrinterWidth = (typeof PRINTER_WIDTHS)[number];

export const PRINTER_WIDTH_LABELS: Record<PrinterWidth, string> = {
  MM_80: "80mm (standard)",
  MM_58: "58mm (narrow)",
};

export const settingsSchema = z.object({
  shopName: z
    .string()
    .trim()
    .min(1, "Shop name is required")
    .max(60, "Keep it under 60 characters so it fits the receipt"),
  addressLine: z.string().trim().max(80).nullable(),
  phone: z.string().trim().max(30).nullable(),
  receiptFooter: z.string().trim().max(120).nullable(),
  printerWidth: z.enum(PRINTER_WIDTHS),
  timezone: z.string().trim().min(1, "Timezone is required"),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
```

- [ ] **Step 2: Create the action**

`src/server/settings/settings-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { shopSettings } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { settingsSchema } from "@/lib/validation/settings-schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";
import { getShopSettings } from "@/server/settings/settings-queries";

export async function updateSettingsAction(
  payload: unknown,
): Promise<ActionResult<null>> {
  return guarded(async () => {
    const actor = await requireSuperadmin();

    const parsed = settingsSchema.safeParse(payload);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join(".")] = issue.message;
      }
      return fail<null>("VALIDATION", "Check the highlighted fields.", fields);
    }

    // A bad timezone would silently misfile every future bill's business date.
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: parsed.data.timezone });
    } catch {
      return fail<null>("VALIDATION", "That is not a valid timezone.", {
        timezone: "Try Asia/Kolkata",
      });
    }

    const before = await getShopSettings();

    await db
      .update(shopSettings)
      .set({ ...parsed.data, updatedBy: actor.id, updatedAt: new Date() });

    await writeAuditLog({
      actorId: actor.id,
      action: "SETTINGS_UPDATED",
      entityType: "shop_settings",
      before: {
        shopName: before.shopName,
        addressLine: before.addressLine,
        phone: before.phone,
        receiptFooter: before.receiptFooter,
        printerWidth: before.printerWidth,
        timezone: before.timezone,
      },
      after: parsed.data,
    });

    revalidatePath(ADMIN_ROUTES.settings);
    // Every receipt renders these values.
    revalidatePath("/print", "layout");
    return ok(null);
  });
}
```

There is no `where` on the update because `shop_settings` holds exactly one row, enforced by the `shop_settings_singleton` CHECK.

- [ ] **Step 3: Move the receipt stylesheet so two routes can share it**

The preview needs the same CSS the print route uses, but `print.css` currently
lives inside `src/app/print/[billId]/` — a path with brackets, which is awkward
to import from elsewhere. Move it next to the components that use it:

```bash
mv "src/app/print/[billId]/print.css" src/components/pages/print/receipt.css
```

Then update the import in `src/app/print/[billId]/page.tsx`:

```tsx
import "@/components/pages/print/receipt.css";
```

(replacing the old `import "./print.css";`)

- [ ] **Step 4: Create the receipt preview**

`src/components/pages/administration/settings/components/ReceiptPreview.tsx`:

```tsx
"use client";

import { Receipt80mm } from "@/components/pages/print/components/Receipt80mm";

import "@/components/pages/print/receipt.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PrinterWidth } from "@/lib/validation/settings-schema";
import type { ReceiptData } from "@/types/bill.types";

/** A fixed sample bill so the preview never depends on real sales. */
function sampleReceipt(shop: ReceiptData["shop"]): ReceiptData {
  return {
    billNumber: 47,
    businessDate: "2026-08-26",
    createdAt: new Date("2026-08-26T14:12:00Z"),
    cashierName: "Ravi",
    lines: [
      {
        itemName: "Veg Burger",
        quantity: 2,
        unitPrice: 6000,
        lineTotal: 12000,
      },
      { itemName: "Coke Small", quantity: 1, unitPrice: 3000, lineTotal: 3000 },
    ],
    subtotal: 15000,
    discount: 1000,
    total: 14000,
    paymentMethod: "CASH",
    tendered: 20000,
    changeDue: 6000,
    shop,
  };
}

export function ReceiptPreview({
  shopName,
  addressLine,
  phone,
  receiptFooter,
  printerWidth,
  timezone,
}: {
  shopName: string;
  addressLine: string;
  phone: string;
  receiptFooter: string;
  printerWidth: PrinterWidth;
  timezone: string;
}) {
  const receipt = sampleReceipt({
    name: shopName || "Shop name",
    addressLine: addressLine || null,
    phone: phone || null,
    receiptFooter: receiptFooter || null,
    printerWidth,
    timezone,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Receipt preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex justify-center rounded-md border bg-white p-4">
          <Receipt80mm receipt={receipt} narrow={printerWidth === "MM_58"} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          A sample bill, not real data. Print settings are configured on the
          till — see docs/printer-setup.md.
        </p>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 5: Create the hook, tab and route**

`src/components/pages/administration/settings/hooks/useShopSettingsTab.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import type { PrinterWidth } from "@/lib/validation/settings-schema";
import { updateSettingsAction } from "@/server/settings/settings-actions";

export type SettingsFormState = {
  shopName: string;
  addressLine: string;
  phone: string;
  receiptFooter: string;
  printerWidth: PrinterWidth;
  timezone: string;
};

export function useShopSettingsTab(initial: SettingsFormState) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = useCallback(() => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateSettingsAction({
        shopName: form.shopName,
        addressLine: form.addressLine || null,
        phone: form.phone || null,
        receiptFooter: form.receiptFooter || null,
        printerWidth: form.printerWidth,
        timezone: form.timezone,
      });

      if (result.ok) {
        toast.success("Settings saved");
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router]);

  return { form, setForm, fieldErrors, submit, isPending };
}
```

`src/components/pages/administration/settings/ShopSettingsTab.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PRINTER_WIDTH_LABELS,
  PRINTER_WIDTHS,
  type PrinterWidth,
} from "@/lib/validation/settings-schema";

import { ReceiptPreview } from "./components/ReceiptPreview";
import {
  useShopSettingsTab,
  type SettingsFormState,
} from "./hooks/useShopSettingsTab";

export function ShopSettingsTab({ initial }: { initial: SettingsFormState }) {
  const tab = useShopSettingsTab(initial);
  const { form, setForm, fieldErrors, isPending } = tab;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Shop settings</h1>
        <p className="text-sm text-muted-foreground">
          These appear on every printed receipt.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                tab.submit();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="shop-name">Shop name</Label>
                <Input
                  id="shop-name"
                  value={form.shopName}
                  disabled={isPending}
                  aria-invalid={Boolean(fieldErrors.shopName)}
                  onChange={(event) =>
                    setForm({ ...form, shopName: event.target.value })
                  }
                />
                {fieldErrors.shopName ? (
                  <p className="text-sm text-destructive">
                    {fieldErrors.shopName}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="shop-address">Address</Label>
                <Input
                  id="shop-address"
                  value={form.addressLine}
                  disabled={isPending}
                  onChange={(event) =>
                    setForm({ ...form, addressLine: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shop-phone">Phone</Label>
                <Input
                  id="shop-phone"
                  value={form.phone}
                  disabled={isPending}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shop-footer">Receipt footer</Label>
                <Textarea
                  id="shop-footer"
                  rows={2}
                  value={form.receiptFooter}
                  disabled={isPending}
                  onChange={(event) =>
                    setForm({ ...form, receiptFooter: event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The thank-you line at the bottom of every receipt.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shop-printer">Printer width</Label>
                  <Select
                    value={form.printerWidth}
                    disabled={isPending}
                    onValueChange={(value) =>
                      setForm({ ...form, printerWidth: value as PrinterWidth })
                    }
                  >
                    <SelectTrigger id="shop-printer">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINTER_WIDTHS.map((width) => (
                        <SelectItem key={width} value={width}>
                          {PRINTER_WIDTH_LABELS[width]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shop-timezone">Timezone</Label>
                  <Input
                    id="shop-timezone"
                    value={form.timezone}
                    disabled={isPending}
                    aria-invalid={Boolean(fieldErrors.timezone)}
                    onChange={(event) =>
                      setForm({ ...form, timezone: event.target.value })
                    }
                  />
                  {fieldErrors.timezone ? (
                    <p className="text-sm text-destructive">
                      {fieldErrors.timezone}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Changing the timezone affects which day future bills are counted
                against. Bills already issued keep the date they were given.
              </p>

              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save settings"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <ReceiptPreview
          shopName={form.shopName}
          addressLine={form.addressLine}
          phone={form.phone}
          receiptFooter={form.receiptFooter}
          printerWidth={form.printerWidth}
          timezone={form.timezone}
        />
      </div>
    </div>
  );
}
```

`src/app/(app)/administration/settings/page.tsx`:

```tsx
import { ShopSettingsTab } from "@/components/pages/administration/settings/ShopSettingsTab";
import { getShopSettings } from "@/server/settings/settings-queries";

export const metadata = {
  title: "Shop settings",
  description: "Details printed on every receipt.",
};

export default async function Page() {
  const settings = await getShopSettings();

  return (
    <ShopSettingsTab
      initial={{
        shopName: settings.shopName,
        addressLine: settings.addressLine ?? "",
        phone: settings.phone ?? "",
        receiptFooter: settings.receiptFooter ?? "",
        printerWidth: settings.printerWidth,
        timezone: settings.timezone,
      }}
    />
  );
}
```

- [ ] **Step 6: Verify settings reach the receipt**

```bash
npm run dev
```

At `/administration/settings`:

1. The preview shows a sample receipt matching the current settings.
2. Type in the shop name → the preview updates **live**.
3. Switch to **58mm** → the preview narrows.
4. Save → create a real bill → the printed receipt shows the new name, address, phone and footer at the new width.
5. Enter a nonsense timezone like `Mars/Olympus` → **refused** with "That is not a valid timezone." This matters: an invalid timezone would misfile every future bill's business date.
6. Set it back to `Asia/Kolkata`.

---

### Task 18: Audit log viewer

**Files:**

- Create: `src/server/audit/audit-queries.ts`
- Create: `src/components/pages/administration/audit/AuditLogTab.tsx`, `AuditLogColumns.tsx`
- Create: `src/components/pages/administration/audit/components/AuditDiffDialog.tsx`
- Create: `src/app/(app)/administration/audit/page.tsx`
- Create: `src/types/audit.types.ts`

**Interfaces:**

- Consumes: `db`, `auditLog`, `users`, `AUDIT_ACTION_LABELS`
- Produces:
  - `listAuditLog(filters, page, pageSize): Promise<AuditLogPage>`
  - a working `/administration/audit` route

- [ ] **Step 1: Create the types and query**

`src/types/audit.types.ts`:

```ts
import type { AuditAction } from "@/constants/audit-actions";

export type AuditLogEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
  actorName: string | null;
};

export type AuditLogPage = {
  rows: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type AuditLogFilters = {
  action?: AuditAction;
  actorId?: string;
};
```

`src/server/audit/audit-queries.ts`:

```ts
import { and, count, desc, eq, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { auditLog, users } from "@/db/schema";
import { withConnectionRetry } from "@/db/with-connection-retry";
import type { AuditLogFilters, AuditLogPage } from "@/types/audit.types";

export async function listAuditLog(
  filters: AuditLogFilters,
  page: number,
  pageSize: number,
): Promise<AuditLogPage> {
  return withConnectionRetry(async () => {
    const conditions: SQL[] = [];
    if (filters.action) conditions.push(eq(auditLog.action, filters.action));
    if (filters.actorId) conditions.push(eq(auditLog.actorId, filters.actorId));

    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const offset = (page - 1) * pageSize;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select({
          id: auditLog.id,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          before: auditLog.before,
          after: auditLog.after,
          createdAt: auditLog.createdAt,
          actorName: users.name,
        })
        .from(auditLog)
        // LEFT join: a failed sign-in has no actor, and those rows matter most.
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(where)
        .orderBy(desc(auditLog.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ value: count() }).from(auditLog).where(where),
    ]);

    return { rows, total: totalRow?.value ?? 0, page, pageSize };
  });
}
```

- [ ] **Step 2: Create the diff dialog and columns**

`src/components/pages/administration/audit/components/AuditDiffDialog.tsx`:

```tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";
import type { AuditLogEntry } from "@/types/audit.types";

function Snapshot({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <pre className="max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs">
        {value === null || value === undefined
          ? "—"
          : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function AuditDiffDialog({
  entry,
  onOpenChange,
}: {
  entry: AuditLogEntry | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {entry
              ? (AUDIT_ACTION_LABELS[entry.action as AuditAction] ??
                entry.action)
              : ""}
          </DialogTitle>
          <DialogDescription>
            {entry?.actorName ?? "System"} ·{" "}
            {entry?.createdAt.toLocaleString("en-GB")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Snapshot label="Before" value={entry?.before} />
          <Snapshot label="After" value={entry?.after} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/pages/administration/audit/AuditLogColumns.tsx`:

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  AUDIT_ACTION_LABELS,
  type AuditAction,
} from "@/constants/audit-actions";
import type { AuditLogEntry } from "@/types/audit.types";

export const AUDIT_HEADERS = ["When", "Who", "What", "Entity", ""] as const;

const DESTRUCTIVE_ACTIONS = new Set([
  "ITEM_DELETED",
  "CATEGORY_DELETED",
  "USER_DEACTIVATED",
  "BILL_VOIDED",
  "LOGIN_LOCKED",
]);

export function AuditTableRow({
  row,
  onInspect,
}: {
  row: AuditLogEntry;
  onInspect: (row: AuditLogEntry) => void;
}) {
  const label = AUDIT_ACTION_LABELS[row.action as AuditAction] ?? row.action;

  return (
    <TableRow>
      <TableCell className="text-sm whitespace-nowrap">
        {row.createdAt.toLocaleString("en-GB")}
      </TableCell>
      <TableCell>{row.actorName ?? "—"}</TableCell>
      <TableCell>
        <Badge
          variant={
            DESTRUCTIVE_ACTIONS.has(row.action) ? "destructive" : "secondary"
          }
        >
          {label}
        </Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {row.entityType}
      </TableCell>
      <TableCell className="text-right">
        {row.before || row.after ? (
          <Button variant="ghost" size="sm" onClick={() => onInspect(row)}>
            Details
          </Button>
        ) : null}
      </TableCell>
    </TableRow>
  );
}
```

- [ ] **Step 3: Create the tab and route**

`src/components/pages/administration/audit/AuditLogTab.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS } from "@/constants/audit-actions";
import type { AuditLogEntry, AuditLogPage } from "@/types/audit.types";

import { AUDIT_HEADERS, AuditTableRow } from "./AuditLogColumns";
import { AuditDiffDialog } from "./components/AuditDiffDialog";

export function AuditLogTab({
  log,
  action,
}: {
  log: AuditLogPage;
  action: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [inspecting, setInspecting] = useState<AuditLogEntry | null>(null);

  const lastPage = Math.max(1, Math.ceil(log.total / log.pageSize));

  function navigate(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "ALL") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() =>
      router.push(`/administration/audit?${params.toString()}`),
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Every change to the menu, prices, accounts and settings — plus failed
          sign-ins and reprints.
        </p>
      </div>

      <Select
        value={action || "ALL"}
        onValueChange={(value) => navigate({ action: value, page: "1" })}
      >
        <SelectTrigger className="w-64">
          <SelectValue placeholder="All activity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All activity</SelectItem>
          {AUDIT_ACTIONS.map((auditAction) => (
            <SelectItem key={auditAction} value={auditAction}>
              {AUDIT_ACTION_LABELS[auditAction]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {log.rows.length === 0 ? (
        <TableEmptyState title="Nothing logged yet" />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {AUDIT_HEADERS.map((header, index) => (
                  <TableHead
                    key={header || `col-${index}`}
                    className={
                      index === AUDIT_HEADERS.length - 1 ? "text-right" : ""
                    }
                  >
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.rows.map((row) => (
                <AuditTableRow
                  key={row.id}
                  row={row}
                  onInspect={setInspecting}
                />
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {log.page} of {lastPage} · {log.total} entries
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={log.page <= 1 || isPending}
                onClick={() => navigate({ page: String(log.page - 1) })}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={log.page >= lastPage || isPending}
                onClick={() => navigate({ page: String(log.page + 1) })}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <AuditDiffDialog
        entry={inspecting}
        onOpenChange={(open) => {
          if (!open) setInspecting(null);
        }}
      />
    </div>
  );
}
```

`src/app/(app)/administration/audit/page.tsx`:

```tsx
import { AuditLogTab } from "@/components/pages/administration/audit/AuditLogTab";
import { AUDIT_ACTIONS, type AuditAction } from "@/constants/audit-actions";
import { listAuditLog } from "@/server/audit/audit-queries";

export const metadata = {
  title: "Audit log",
  description: "Who changed what, and when.",
};

const PAGE_SIZE = 50;

export default async function Page({
  searchParams,
}: PageProps<"/administration/audit">) {
  const params = await searchParams;

  const rawAction = typeof params.action === "string" ? params.action : "";
  const action = AUDIT_ACTIONS.includes(rawAction as AuditAction)
    ? (rawAction as AuditAction)
    : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const log = await listAuditLog({ action }, page, PAGE_SIZE);

  return <AuditLogTab log={log} action={action ?? ""} />;
}
```

- [ ] **Step 4: Verify the audit trail — M6's gate**

```bash
npm run dev
```

At `/administration/audit`:

1. Entries from every earlier task are listed, newest first.
2. Filter to **Price changed** → shows the Ice Cream price change from Task 6.
3. Click **Details** → the before/after JSON shows `{"price": 4550}` → `{"price": 5000}`.
4. Filter to **Failed sign-in** → shows the attempts from Plan 1.
5. Filter to **Bill reprinted** → shows the reprint from Task 14.
6. **Confirm no secrets are present:**

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`
  SELECT count(*)::int AS leaks FROM audit_log
  WHERE before::text ILIKE '%password%' OR after::text ILIKE '%password%'
     OR before::text ILIKE '%hash%'    OR after::text ILIKE '%hash%'\`);
console.log(r.rows[0].leaks === 0 ? 'PASS — no credentials in the audit log' : 'FAIL — credentials found: ' + r.rows[0].leaks);
process.exit(0);
"
```

Expected: `PASS`. Every superadmin can read this log, so a leak here is a real one.

```bash
npm run verify:users && npx tsc --noEmit && npm run lint
```

---

### Task 19: Export all data

**Files:**

- Create: `src/server/reports/export-all-action.ts`
- Modify: `src/components/pages/administration/settings/ShopSettingsTab.tsx` (add the export card)

**Interfaces:**

- Consumes: `db`, `bills`, `billItems`, `items`, `users`, `toCsv`, `csvAmount`, `requireSuperadmin`
- Produces: `exportAllDataAction(): Promise<ActionResult<{ bills: string; billItems: string; items: string }>>`

This is spec §16.1's mitigation for the free tier's short restore window.

- [ ] **Step 1: Create the export action**

`src/server/reports/export-all-action.ts`:

```ts
"use server";

import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { billItems, bills, categories, items, users } from "@/db/schema";
import { guarded, requireSuperadmin } from "@/lib/auth/guard";
import { csvAmount, toCsv } from "@/lib/utils/csv";
import { type ActionResult, ok } from "@/lib/utils/result";

export type ExportBundle = {
  bills: string;
  billItems: string;
  items: string;
};

/**
 * The owner's monthly safety net. Neon's free plan keeps only a short restore
 * window, and this database is the shop's entire sales ledger. See spec §16.1.
 */
export async function exportAllDataAction(): Promise<
  ActionResult<ExportBundle>
> {
  return guarded(async () => {
    await requireSuperadmin();

    const billRows = await db
      .select({
        businessDate: bills.businessDate,
        billNumber: bills.billNumber,
        createdAt: bills.createdAt,
        cashier: users.name,
        subtotal: bills.subtotal,
        discount: bills.discount,
        total: bills.total,
        paymentMethod: bills.paymentMethod,
        status: bills.status,
        id: bills.id,
      })
      .from(bills)
      .innerJoin(users, eq(users.id, bills.createdBy))
      .orderBy(asc(bills.businessDate), asc(bills.billNumber));

    const lineRows = await db
      .select({
        billId: billItems.billId,
        businessDate: bills.businessDate,
        billNumber: bills.billNumber,
        itemName: billItems.itemName,
        categoryName: billItems.categoryName,
        unitPrice: billItems.unitPrice,
        quantity: billItems.quantity,
        lineTotal: billItems.lineTotal,
      })
      .from(billItems)
      .innerJoin(bills, eq(bills.id, billItems.billId))
      .orderBy(asc(bills.businessDate), asc(bills.billNumber));

    const itemRows = await db
      .select({
        name: items.name,
        categoryName: categories.name,
        price: items.price,
        isActive: items.isActive,
        isAvailable: items.isAvailable,
      })
      .from(items)
      .innerJoin(categories, eq(categories.id, items.categoryId))
      .orderBy(asc(categories.name), asc(items.name));

    return ok({
      bills: toCsv(billRows, [
        { header: "Date", value: (r) => r.businessDate },
        { header: "Bill No", value: (r) => r.billNumber },
        { header: "Time", value: (r) => r.createdAt.toISOString() },
        { header: "Cashier", value: (r) => r.cashier },
        { header: "Subtotal", value: (r) => csvAmount(r.subtotal) },
        { header: "Discount", value: (r) => csvAmount(r.discount) },
        { header: "Total", value: (r) => csvAmount(r.total) },
        { header: "Payment", value: (r) => r.paymentMethod },
        { header: "Status", value: (r) => r.status },
        { header: "Bill ID", value: (r) => r.id },
      ]),
      billItems: toCsv(lineRows, [
        { header: "Date", value: (r) => r.businessDate },
        { header: "Bill No", value: (r) => r.billNumber },
        { header: "Item", value: (r) => r.itemName },
        { header: "Category", value: (r) => r.categoryName },
        { header: "Unit Price", value: (r) => csvAmount(r.unitPrice) },
        { header: "Qty", value: (r) => r.quantity },
        { header: "Line Total", value: (r) => csvAmount(r.lineTotal) },
        { header: "Bill ID", value: (r) => r.billId },
      ]),
      items: toCsv(itemRows, [
        { header: "Item", value: (r) => r.name },
        { header: "Category", value: (r) => r.categoryName },
        { header: "Current Price", value: (r) => csvAmount(r.price) },
        { header: "On menu", value: (r) => (r.isActive ? "Yes" : "No") },
        { header: "Available", value: (r) => (r.isAvailable ? "Yes" : "No") },
      ]),
    });
  });
}
```

- [ ] **Step 2: Add the export card to settings**

Append this component inside `ShopSettingsTab.tsx`, rendered below the two-column grid:

```tsx
function ExportAllCard() {
  const [isPending, startTransition] = useTransition();

  function download(name: string, csv: string) {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleExport() {
    startTransition(async () => {
      const result = await exportAllDataAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      const stamp = new Date().toISOString().slice(0, 10);
      download(`bills-${stamp}.csv`, result.data.bills);
      download(`bill-items-${stamp}.csv`, result.data.billItems);
      download(`items-${stamp}.csv`, result.data.items);
      toast.success("Three files downloaded");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Export all data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Downloads every bill, every sold line and the current menu as three
          CSV files. <strong>Do this once a month</strong> and keep the files
          somewhere other than this computer — the free database plan keeps only
          a short restore window.
        </p>
        <Button variant="outline" disabled={isPending} onClick={handleExport}>
          <Download className="size-4" />
          {isPending ? "Preparing…" : "Export all data"}
        </Button>
      </CardContent>
    </Card>
  );
}
```

Add the imports it needs at the top of the file: `useTransition` from `react`, `toast` from `sonner`, `Download` from `lucide-react`, and `exportAllDataAction` from `@/server/reports/export-all-action`. Render `<ExportAllCard />` after the grid.

- [ ] **Step 3: Verify the export**

At `/administration/settings`, click **Export all data**.

Expected: three CSV files download. Open `bills-*.csv`:

1. One row per bill, including voided ones with `Status = VOID`.
2. Amounts read `140.00`.
3. The row count matches:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`SELECT (SELECT count(*) FROM bills) AS bills, (SELECT count(*) FROM bill_items) AS lines\`);
console.table(r.rows);
process.exit(0);
"
```

4. Sign in as a cashier and confirm the Settings page is **not reachable** — the export is superadmin-only.

---

# M7 — Polish and Handover

### Task 20: Navigation, error pages and mobile

**Files:**

- Modify: `src/components/layout/AppNavbar.tsx`
- Create: `src/app/(app)/error.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`
- Create: `src/app/(app)/administration/error.tsx`

**Interfaces:**

- Consumes: `SessionUser`, `ADMIN_ROUTES`, `REPORT_ROUTES`
- Produces: role-aware navigation and friendly error pages

- [ ] **Step 1: Make the navbar role-aware**

Replace `src/components/layout/AppNavbar.tsx`:

```tsx
"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Container } from "@/components/layout/Container";
import { UserMenu } from "@/components/layout/UserMenu";
import { Button } from "@/components/ui/button";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";
import type { SessionUser } from "@/lib/auth/guard";
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
    <header className="sticky top-0 z-40 border-b bg-background">
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
                  : "text-muted-foreground hover:bg-muted",
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
                className="rounded-md px-3 py-2 text-sm font-medium"
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
```

- [ ] **Step 2: Create the error boundaries**

`src/app/(app)/error.tsx`:

```tsx
"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isForbidden = error.message.includes("owner account");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">
        {isForbidden ? "Not allowed" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {isForbidden
          ? "Only the owner account can open that page. Ask the owner if you need access."
          : "The page could not load. Try again — if it keeps happening, note the reference below."}
      </p>
      {error.digest && !isForbidden ? (
        <p className="font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="flex gap-2">
        {!isForbidden ? <Button onClick={reset}>Try again</Button> : null}
        <Button variant="outline" asChild>
          <Link href="/bill">Back to billing</Link>
        </Button>
      </div>
    </div>
  );
}
```

`src/app/(app)/administration/error.tsx` — same file contents as above. Duplicating it means a crash inside `/administration` cannot take down the billing screen's boundary.

`src/app/not-found.tsx`:

```tsx
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">
        That page does not exist, or the bill you are looking for was removed.
      </p>
      <Button asChild>
        <Link href="/bill">Back to billing</Link>
      </Button>
    </div>
  );
}
```

`src/app/global-error.tsx`:

```tsx
"use client";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
          The app could not start
        </h1>
        <p style={{ color: "#666", fontSize: "0.875rem" }}>
          Reload the page. If this keeps happening, contact whoever set this up
          {error.digest ? ` and quote ${error.digest}` : ""}.
        </p>
        <a href="/bill" style={{ textDecoration: "underline" }}>
          Back to billing
        </a>
      </body>
    </html>
  );
}
```

`global-error.tsx` replaces the root layout entirely, so it cannot use Tailwind classes or any component — inline styles only.

- [ ] **Step 3: Verify navigation and error handling**

```bash
npm run dev
```

1. As `owner`: the navbar shows all ten links; the active one is highlighted.
2. As `cashier`: only the five non-admin links appear. Navigate directly to `/administration/items` → **the "Not allowed" page**, not a raw stack trace.
3. Visit `/nonsense` → the not-found page.
4. Visit `/bills/00000000-0000-0000-0000-000000000000` → the not-found page.
5. Narrow the browser to phone width → the navbar collapses to a menu button that opens the links.
6. At phone width, check `/bill` is still usable: the cart stacks below the menu grid.

- [ ] **Step 4: Full build check**

```bash
npx tsc --noEmit && npm run lint && npm run build
```

Expected: all three exit 0.

---

### Task 21: Handover

**Files:**

- Create: `scripts/reset-bills.ts`
- Modify: `docs/deployment.md`, `CLAUDE.md`
- Modify: `package.json`

**Interfaces:**

- Consumes: everything
- Produces: a clean production database, updated docs, a deployed app

- [ ] **Step 1: Create the test-data reset script**

`scripts/reset-bills.ts`:

```ts
import { sql } from "drizzle-orm";

import { db } from "../src/db";

/**
 * Deletes ALL bills, bill lines and counters. For the development-to-handover
 * transition only — the shop's real ledger must never be run through this.
 *
 * The immutability triggers exist precisely to stop this happening by
 * accident, so they are disabled and re-enabled around the delete.
 */
async function main() {
  if (process.argv[2] !== "--yes-delete-all-bills") {
    console.error(
      "Refusing to run without an explicit flag.\n\n" +
        "  npm run db:reset-bills -- --yes-delete-all-bills\n\n" +
        "This permanently deletes every bill. Never run it against a shop's\n" +
        "real data. Take a pg_dump first (see docs/deployment.md).",
    );
    process.exit(1);
  }

  const before = await db.execute(
    sql`SELECT (SELECT count(*)::int FROM bills) AS bills,
               (SELECT count(*)::int FROM bill_items) AS lines`,
  );
  console.table(before.rows);

  await db.execute(
    sql`ALTER TABLE bill_items DISABLE TRIGGER bill_items_immutable`,
  );
  await db.execute(sql`ALTER TABLE bills DISABLE TRIGGER bills_no_delete`);
  await db.execute(
    sql`ALTER TABLE bills DISABLE TRIGGER bills_restrict_update`,
  );

  await db.execute(sql`DELETE FROM bill_items`);
  await db.execute(sql`DELETE FROM bills`);
  await db.execute(sql`DELETE FROM bill_counters`);

  await db.execute(
    sql`ALTER TABLE bill_items ENABLE TRIGGER bill_items_immutable`,
  );
  await db.execute(sql`ALTER TABLE bills ENABLE TRIGGER bills_no_delete`);
  await db.execute(sql`ALTER TABLE bills ENABLE TRIGGER bills_restrict_update`);

  // Confirm every trigger came back on. Leaving one disabled would silently
  // remove the audit guarantee, and nothing else would ever notice.
  const check = await db.execute(sql`
    SELECT tgname, tgenabled FROM pg_trigger
    WHERE tgname IN ('bill_items_immutable', 'bills_no_delete', 'bills_restrict_update')
    ORDER BY tgname`);

  const triggers = check.rows as Array<{ tgname: string; tgenabled: string }>;
  console.table(triggers);

  // 'O' means "enabled, origin" — the normal enabled state. 'D' means disabled.
  const allEnabled =
    triggers.length === 3 && triggers.every((t) => t.tgenabled === "O");

  console.log(
    allEnabled
      ? "Bills cleared. All three immutability triggers are ENABLED."
      : "WARNING — a trigger is still disabled. Re-run `npm run db:migrate`.",
  );

  process.exit(allEnabled ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`: `"db:reset-bills": "tsx --env-file=.env.local scripts/reset-bills.ts"`

- [ ] **Step 2: Seed the client's real menu**

Replace the `SAMPLE_MENU` constant in `src/db/seed.ts` with the client's actual categories, items and prices. Prices are written as **rupee strings exactly as they appear on the menu board** — ₹60 is `"60.00"`, ₹60.50 is `"60.50"`.

Then clear the test data and reseed:

```bash
npm run db:reset-bills -- --yes-delete-all-bills
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
await db.execute(sql\`DELETE FROM audit_log\`);
await db.execute(sql\`DELETE FROM items\`);
await db.execute(sql\`DELETE FROM categories\`);
console.log('menu and audit log cleared');
process.exit(0);
"
npm run db:seed
```

Then in the app: sign in, set the real shop name, address, phone and receipt footer under Settings, and upload item photos.

- [ ] **Step 3: Change the owner's password and remove test accounts**

1. At `/administration/users`, reset `owner`'s password to one the client chooses.
2. Deactivate `cashier` and `cashier2`, or reset them to real staff accounts.
3. Clear `SEED_SUPERADMIN_PASSWORD` from `.env.local` and from Netlify's environment variables.

- [ ] **Step 4: Fill in the backup retention value**

Open the Neon console → Project settings → find the history-retention window. Replace the `_____` blank in `docs/deployment.md`. Spec §16.1 requires a confirmed number, not an assumption.

- [ ] **Step 5: Update the docs**

Add to `CLAUDE.md` under Verification:

```markdown
| `verify:categories` | soft delete frees a category name |
| `verify:items` | price changes are auditable; soft delete frees an item name |
| `verify:imagekit` | upload signature is correct and the private key stays server-side |
| `verify:reports` | date-range maths and CSV escaping |
| `verify:report-queries` | aggregates match raw SQL; voided bills are excluded |
| `verify:users` | account invariants and password resets |
```

Add to `docs/deployment.md`:

```markdown
## Monthly routine for the owner

1. Sign in as the owner.
2. Settings → **Export all data** → keep the three CSV files off this computer.

That is the only recurring task. Everything else is automatic.
```

- [ ] **Step 6: Deploy**

```bash
npm run verify:all
npx tsc --noEmit && npm run lint && npm run build
netlify env:set AUTH_URL https://YOUR-SITE.netlify.app
netlify deploy --build --prod
```

Confirm the Netlify environment has the **pooled** `DATABASE_URL` (the host must contain `-pooler`), `AUTH_SECRET`, `AUTH_URL` and all five ImageKit variables.

- [ ] **Step 7: Final acceptance on the deployed site**

Run every one of these against the production URL, not localhost:

| #   | Check                                                           | Expected                                                                  |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | Sign in as the owner                                            | Lands on `/bill`                                                          |
| 2   | Ring up three items, apply a ₹10 discount, pay cash with change | Totals correct on screen                                                  |
| 3   | Save & Print                                                    | Receipt opens and auto-prints on the thermal printer                      |
| 4   | Check the paper                                                 | Columns aligned, nothing clipped, no URL header                           |
| 5   | Ring up two more bills                                          | Numbers run 1, 2, 3 with no gaps                                          |
| 6   | `/dashboard`                                                    | Today's sales match what you rang up                                      |
| 7   | `/reports/items`                                                | Shows what you sold                                                       |
| 8   | `/bills` → open one → **Reprint**                               | Prints again; `/administration/audit` shows the reprint                   |
| 9   | Change an item's price                                          | `/administration/audit` shows before and after                            |
| 10  | Re-open an older bill                                           | Still shows the OLD price                                                 |
| 11  | Settings → Export all data                                      | Three CSVs download and open cleanly                                      |
| 12  | Sign in as a cashier                                            | No admin links; `/administration/items` shows "Not allowed"               |
| 13  | Turn off the shop's wi-fi, try to save a bill                   | Red offline banner; **Retry** after reconnecting creates exactly ONE bill |

Check 13 is the one to insist on. It is the failure the shop will actually hit, and the idempotency key is what makes it safe.

- [ ] **Step 8: Hand over**

Give the client:

- The live URL and their owner credentials
- `docs/printer-setup.md` (printed, for the till)
- The monthly export routine from `docs/deployment.md`
- The four open items from spec §17 — chiefly whether they now want **bill void/cancel**, which is schema-ready and roughly half a day

---

## Known gaps at the end of Plan 2

Recorded so nothing is discovered by surprise. All were scoped out deliberately in spec §3.

| Gap                        | Status                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Bill void / cancel **UI**  | Schema, triggers and reports all support it. Only the UI is missing. ~half a day.         |
| Tax / GST invoicing        | Out of scope. Would need HSN codes, per-item tax slabs and CGST/SGST split.               |
| Inventory / stock tracking | Out of scope.                                                                             |
| Customer records           | Out of scope.                                                                             |
| Offline mode               | Out of scope. The offline banner prevents the dangerous failure; it does not queue bills. |
| Table / dine-in orders     | Out of scope. The schema does not model open orders.                                      |
| Multi-outlet               | Out of scope. Everything assumes one shop.                                                |
