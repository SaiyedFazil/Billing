# Ember Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen to the approved Ember design without changing behaviour.

**Architecture:** Token-first. Ember colours, radii, shadows and fonts live in
`globals.css` + `layout.tsx`; shadcn primitives are restyled once so every page
inherits them; a new sidebar shell replaces the top navbar; hero screens (Login,
New bill, Dashboard) get bespoke layouts; table pages share `PageHeader` and
`TableCard`.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (`@theme inline` in
globals.css, no config file), shadcn on `radix-ui`, lucide-react, recharts 3,
`next/font/google`.

**Spec:** `docs/superpowers/specs/2026-09-19-ember-redesign-design.md`
**Visual reference:** https://claude.ai/artifact/QzWRBUhPNx2xDJtJaukSiV

## Global Constraints

- No `number` in a money path. Money stays a decimal string through `money.ts`;
  `Number()` only for chart/bar geometry, never summed back into an amount.
- Every page and server action keeps its `requireUser()` / `requireSuperadmin()`.
- Hooks keep their existing return fields; only additive display fields allowed.
- `src/components/pages/print/**` and `receipt.css` are not modified.
- No test framework (client decision). Each task is verified with
  `npm run typecheck` and `npm run lint`; the last task runs
  `npm run verify:offline` and `npm run build`.
- Work on branch `feature/ember-redesign`. Commit each task on its own after
  its typecheck passes, before starting the next task.

---

### Task 1: Tokens and fonts

**Files:** Modify `src/app/globals.css`, `src/app/layout.tsx`

**Produces (Tailwind utilities used by every later task):**
`bg-brand text-brand bg-brand-soft text-brand-ink` · `bg-success text-success
bg-success-soft text-success-ink` · same for `warning` and `destructive`
(`bg-destructive-soft text-destructive-ink`) · `bg-sidebar text-sidebar-foreground
text-sidebar-muted bg-sidebar-accent` · `bg-table-head` · `font-heading font-sans
font-mono` · `shadow-card shadow-lift shadow-brand` · `bg-dots`.

- [ ] Replace the self-referencing `--font-sans: var(--font-sans)` with
      `var(--font-geist-sans)`; add `--font-heading: var(--font-bricolage)`.
- [ ] Replace grayscale `:root` values with the Ember table from the spec; add
      the brand/success/warning/destructive soft + ink tokens, `--table-head`,
      `--sidebar-muted`, chart-1..5 = tomato, mustard, basil, stone, tomato tint.
- [ ] Drop the unused `.dark` block (light only, per spec).
- [ ] `layout.tsx`: load `Bricolage_Grotesque({ variable: "--font-bricolage", axes: ["opsz"] })`
      alongside Geist / Geist_Mono.
- [ ] Run `npm run typecheck`.

### Task 2: Restyle shadcn primitives

**Files:** Modify `src/components/ui/{button,card,input,textarea,select,badge,table,switch,dialog,alert-dialog,skeleton,sonner,label}.tsx`

**Produces:**

- `Button` variants `default | outline | secondary | ghost | destructive | link | dark`;
  sizes `default h-10 | xs | sm h-8 | lg h-12 | icon size-9 | icon-xs | icon-sm | icon-lg`.
- `Badge` variants add `success | warning | brand`; new prop `dot?: boolean`.
- `Card` = rounded-2xl paper card with `shadow-card`; `CardTitle` uses `font-heading`.
- `TableHeader` cream row with uppercase 12px headers; cells `px-4 py-3`.
- `Switch` checked = basil.

- [ ] Apply the classes; run `npm run typecheck && npm run lint`.

### Task 3: Shared layout pieces

**Files:**

- Create `src/components/layout/PageHeader.tsx` —
  `PageHeader({ title, description?, eyebrow?, actions?, leading? })`
- Create `src/components/custom/TableCard.tsx` — `TableCard({ children, footer?, className? })`
- Create `src/components/custom/PaymentMethodLabel.tsx` — `PaymentMethodLabel({ method })`
- Create `src/lib/utils/payment-method-style.ts` — `PAYMENT_METHOD_ICONS: Record<PaymentMethod, LucideIcon>`, `PAYMENT_METHOD_DOT: Record<PaymentMethod, string>`
- Create `src/lib/utils/category-tone.ts` — `type CategoryTone = { tile; ink; dot }`, `categoryTone(index: number): CategoryTone`
- Create `src/lib/utils/initials.ts` — `initials(name: string): string`
- Modify `src/components/layout/Container.tsx` — owns page padding `py-6 lg:py-9`
- Modify `src/components/custom/{TableEmptyState,TableErrorState,ConfirmDialog,OfflineBanner}.tsx`

- [ ] Create/modify; typecheck.

### Task 4: Sidebar shell

**Files:**

- Create `src/components/layout/navigation.ts` — `NAV_SECTIONS` (Insights, Manage[ownerOnly]) of `{ href, label, icon }`
- Create `src/components/layout/BrandMark.tsx`, `AppSidebar.tsx` (`{ user, shopName, collapsed, onNavigate? }`), `MobileNav.tsx`, `AppShell.tsx` (`{ user, shopName, children }`)
- Modify `src/app/(app)/layout.tsx` — `requireUser()` then `getShopName()` (fallback "Billing" on error) → `<OfflineBanner/><AppShell>`
- Modify `src/server/settings/settings-queries.ts` — add `getShopName(): Promise<string>`
- Modify `src/server/settings/settings-actions.ts` — also `revalidatePath("/", "layout")` so a renamed shop shows in the sidebar
- Delete `src/components/layout/AppNavbar.tsx`, `UserMenu.tsx`

- [ ] Sidebar collapses to a 76px rail when `pathname === "/bill"`; below `lg` a top bar + Radix Dialog drawer.
- [ ] Active link = exact match or `pathname.startsWith(href + "/")`.
- [ ] Typecheck + lint.

### Task 5: Sign in

**Files:** Modify `src/components/pages/login/LoginPage.tsx`, `components/LoginForm.tsx`

- [ ] Split screen per the "Sign in" artboard; brand panel `hidden lg:flex`; inputs with leading icons; `h-12` submit with arrow. Form logic untouched.

### Task 6: New bill (POS)

**Files:** Modify `bill/BillPage.tsx`, `bill/hooks/useBillPage.ts` (add `quantityByItemId`, `toneByCategoryId`, `itemCount`), `bill/components/{MenuGrid,ItemSearchBox,CategoryTabs,MenuItemCard,CartPanel,CartLine,DiscountInput,PaymentPanel}.tsx`

- [ ] Layout `lg:h-dvh`, `lg:grid-cols-[1fr_360px] xl:grid-cols-[1fr_404px]`; mobile scrolls naturally.
- [ ] Cards: tone tile or photo, `×qty` badge + brand ring when in cart, sold-out pill.
- [ ] Cart ticket: notched dashed divider, big `font-heading` total, icon payment grid, tendered + basil change box, `h-15` Save & Print.
- [ ] Typecheck + lint.

### Task 7: Dashboard

**Files:** Modify `dashboard/DashboardPage.tsx`, `components/{StatCard,SalesTrendChart,TopItemsCard}.tsx`, `src/lib/utils/dates.ts` (add `formatLongDate(iso)`), `app/(app)/dashboard/page.tsx`

- [ ] `StatCard({ label, value, hint?, icon, tone: "hero" | "brand" | "mustard" | "basil" })`.
- [ ] Chart: `Cell` per bar — today `var(--chart-1)`, earlier `var(--chart-5)`; compact ₹ ticks (display only).
- [ ] Top sellers: rank badges + share bars.

### Task 8: Bills and bill details

**Files:** Modify `bills/{BillsTab,BillsColumns}.tsx`, `bills/components/BillsTableToolbar.tsx`, `bills/bill-details/BillDetails.tsx`, `app/(app)/bills/page.tsx`, `app/(app)/bills/[billId]/page.tsx`

### Task 9: Reports

**Files:** Modify `reports/components/{ReportDateRangeBar,ExportCsvButton}.tsx`, `reports/sales/{SalesReportTab,SalesReportColumns}.tsx`, `reports/items/{ItemReportTab,ItemReportColumns}.tsx`

- [ ] Segmented presets with the active one derived from `presets[p].from/to === from/to`.
- [ ] Sales: hero KPI, day table with tinted total row, stacked payment bar.

### Task 10: Administration

**Files:** Modify `administration/items/**`, `categories/**`, `users/**`, `settings/**`, `audit/**` tab/columns/toolbar/dialog files.

- [ ] `PageHeader` + `TableCard` everywhere; category tone chips and tiles on Items; avatar + role/status badges on Accounts.

### Task 11: Error surfaces and final verification

**Files:** Modify `app/(app)/error.tsx`, `app/(app)/administration/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx`

- [ ] Restyle; then `npm run verify:offline` and `npm run build`; walk every screen in the browser at desktop and phone widths.
