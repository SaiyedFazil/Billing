# Billing — Project Guide

A counter POS for a single-outlet fast food shop: a cashier rings up orders and
prints thermal receipts; the owner manages the menu, accounts and settings and
reads the sales reports. Next.js 16 App Router, Drizzle + Neon Postgres,
Auth.js v5, Tailwind v4 + shadcn/ui, deployed to Netlify on free tiers.

| Doc                                                             | What it holds                                   |
| --------------------------------------------------------------- | ----------------------------------------------- |
| `docs/superpowers/specs/2026-08-23-fastfood-billing-design.md`  | The product spec (§ numbers cited in code)      |
| `docs/superpowers/specs/2026-09-19-ember-redesign-design.md`    | The Ember visual design                         |
| `docs/superpowers/specs/2026-10-18-stock-management-design.md`  | Per-item stock tracking                         |
| `docs/superpowers/specs/2026-10-20-cash-book-design.md`         | Cash book: money in vs owner-entered money out  |
| `docs/superpowers/specs/2026-10-24-split-payment-design.md`     | Split payment: one bill paid by several methods |
| `docs/superpowers/specs/2026-10-24-mobile-responsive-design.md` | Phones and tablets: what changes below 1024px   |
| `docs/superpowers/plans/`                                       | Implementation plans, one per piece of work     |
| `docs/deployment.md`                                            | Netlify + Neon setup, migrations, backups       |
| `docs/printer-setup.md`                                         | One-time thermal printer setup on the till      |
| `docs/brand/README.md`                                          | The Mobito logo files and where each one goes   |

## Commands

```bash
npm run dev              # http://localhost:3000
npm run build            # production build — must pass before a deploy
npm run format           # Prettier: format every file
npm run lint:fix         # ESLint: apply safe fixes
npm run verify:offline   # money, retry, reports, typecheck, lint, format:check (no DB)
npm run verify:all       # the above plus every database check
```

Database: `db:generate` (after a schema change) · `db:migrate` · `db:seed` ·
`db:import-menu` (loads the printed menu card; `-- --replace` swaps the whole
menu, `-- --dry-run` previews) ·
`db:studio`. The full list, with what each proves, is under
[Verification](#verification).

## Non-negotiables

1. **Money is RUPEES as an exact decimal string** — `"60.50"`, never a
   JavaScript number. Postgres columns are `numeric(10,2)`; arithmetic goes
   through `src/lib/utils/money.ts`, which uses big.js.

   Floats are banned, and not for style reasons: `60.50 + 40.30 - 10` evaluates
   to `110.78999999999999`, which **fails the `bills_total_matches` CHECK
   constraint** — the bill is rejected by the database and the cashier cannot
   save it. `₹1.005` also rounds to `1.00` rather than `1.01`, so the shop
   loses money on every percentage discount. Never introduce a `number` into a
   money path, including `JSON.parse` of an API payload.

   The one exception is **display geometry**: chart bar heights and share-bar
   widths may call `Number()` on an amount, with a comment saying so. Such a
   number is never summed, stored or sent back.

2. **Every server action AND every protected page starts with `requireUser()`
   or `requireSuperadmin()`.** `proxy.ts` only redirects — Server Actions are
   publicly callable endpoints, so the guard is the real access control.

   **A layout guard is not enough for pages.** Next.js renders layouts and
   pages _in parallel_, so a page that relies on its layout's
   `requireSuperadmin()` will still run its queries and stream the results into
   the RSC payload before the layout's error propagates. This was caught in
   testing: a cashier requesting `/administration/items` saw the "Not allowed"
   screen but received the entire menu with prices in the response body. Every
   page under `/administration` now calls the guard itself.

3. **The client never sends prices.** Bill payloads carry `{ itemId, quantity }`.
   The server re-reads every price from the database.
4. **Reports read `bill_items` snapshot columns.** Never join to `items` for a
   name or price — that would let a rename rewrite history.
5. **Never `DELETE` an item, category, user, expense or expense category.**
   Set `is_active = false`, or cancel the expense.
6. **Inside `db.transaction`, only throw.** Returning from the callback commits.
   Any validation that can fail belongs _before_ the transaction opens — see
   the structure of `create-bill-service.ts`.
7. **Drizzle uses `neon-serverless` with a `Pool`.** Never `neon-http` — it
   cannot do interactive transactions, which bill creation depends on.
8. **`db` is a lazy Proxy.** It connects on first property access, so importing
   it during `next build` needs no DATABASE_URL and opens no connection.
9. **Stock changes only through `src/server/stock/stock-service.ts`**, and
   always together with a `stock_movements` row in the same transaction. That
   table is append-only (a trigger rejects UPDATE and DELETE); fix a mistake
   with a new `CORRECTION` row. Stock is a whole-unit `integer`, not money.
   An untracked item (`track_stock = false`) must bill exactly as before
   stock existed. See `docs/superpowers/specs/2026-10-18-stock-management-design.md`.
10. **How a bill was paid lives in `bill_payments`.** Never sum money by
    `bills.payment_method`: a `SPLIT` bill's money belongs to its lines.
    Showing the label is fine.
11. **Bill numbers are one running sequence.** `bills.bill_number` counts every
    bill the shop has ever issued: never reset (not at midnight, not per
    month), never repeated (`UNIQUE (bill_number)`). It is reserved from the
    single `bill_counters` row inside the bill's own transaction, which keeps it
    gapless. Never build a number from the date or restart the counter; a bill's
    number is frozen by trigger. Migration 0012 renumbered history once.

## Structure

```
src/
├─ app/                    Routing only
│  ├─ (app)/               Signed-in shell: sidebar + OfflineBanner
│  │  ├─ bill/             The till (New Bill)
│  │  ├─ dashboard/ bills/ reports/        Both roles
│  │  └─ administration/   Owner only — every page guards itself
│  ├─ login/               Outside the shell
│  └─ print/[billId]/      Outside the shell — bare receipt, no sidebar
├─ components/
│  ├─ ui/                  shadcn primitives, restyled for Ember
│  ├─ layout/              AppShell, AppSidebar, MobileNav, PageHeader, Container
│  ├─ custom/              Shared app components (TableCard, StatCard, …)
│  └─ pages/<feature>/     One folder per screen
├─ server/<domain>/        *-actions.ts · *-queries.ts · *-service.ts
├─ db/                     Drizzle schema, migrations, seed, lazy client
├─ lib/                    auth guards, routes, money, dates, validation, storage
├─ hooks/ · constants/ · types/
scripts/                   verify-* checks and DB utilities, run with tsx
```

- **`src/app/`** — a `page.tsx` guards, fetches, exports `metadata` and renders
  one component from `src/components/pages/`.
- **Loading** — every page change shows `PageLoader` (a centred spinner)
  from the click until the data is there, in two halves that look the same:
  `usePendingNavigation` in `AppShell` covers the wait before the new page
  takes over (Next skips `loading.tsx` when a link's prefetch has not
  finished), and one `(app)/loading.tsx` covers the page's own queries. The
  shell's shop-name query streams behind a `Suspense` in `(app)/layout.tsx`;
  never `await` a query in that layout, or the screen stays blank until it
  returns.
- **Pages** — logic lives in `hooks/use<Feature>Tab.ts`, not in the component.
  Table pages split into `XTab.tsx`, `XColumns.tsx` and `hooks/useXTab.ts`;
  page-only pieces go in the feature's `components/`.
- **Server** — `*-actions.ts` are thin (guard, validate, delegate, return an
  `ActionResult`); `*-queries.ts` read; `*-service.ts` hold the logic.
- **The shell** reads the shop name through `getShopName()`, which never
  throws, so a failed settings read cannot take every page down.
- **Navigation** is defined once in `src/components/layout/navigation.ts`;
  hiding a link there is a courtesy, never access control.

## Design system — "Ember"

The UI follows the Ember spec
(`docs/superpowers/specs/2026-09-19-ember-redesign-design.md`). Light theme
only. Tokens are CSS variables in `src/app/globals.css`, exposed as Tailwind
utilities through `@theme inline`.

| Role                        | Utility                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------- |
| Canvas / cards              | `bg-background` (cream) · `bg-card` (paper)                                           |
| Text / secondary text       | `text-foreground` · `text-muted-foreground`                                           |
| Primary action (white text) | `bg-primary` · `hover:bg-primary-hover`                                               |
| Highlight, decoration only  | `bg-brand` · `text-brand` · `ring-brand`                                              |
| Selected / soft fills       | `bg-brand-soft` + `text-brand-ink`                                                    |
| Status                      | `success` · `warning` · `destructive`, each with `-soft` and `-ink`                   |
| Sidebar                     | `bg-sidebar` · `text-sidebar-foreground` · `text-sidebar-muted`                       |
| Table header row            | `bg-table-head`                                                                       |
| Shadows                     | `shadow-card` · `shadow-lift` · `shadow-brand` · `shadow-hero`                        |
| Type                        | `font-heading` (Bricolage Grotesque) · `font-sans` (Geist) · `font-mono` (Geist Mono) |

**Rules**

- **Use tokens, not hex.** A new colour goes into `globals.css` first. The
  exceptions are the category tints in `lib/utils/category-tone.ts` and a few
  one-off sidebar and ticket shades.
- **`bg-primary` under text, `bg-brand` never.** Tomato 500 (`brand`) fails
  contrast with white; Tomato 600 (`primary`) passes at 4.6:1.
- **Amounts** are `tabular-nums`; headline totals and KPIs also use
  `font-heading`. Always format with `formatINR()`.
- **Page anatomy**: `PageHeader` (title, description, actions) → toolbar →
  content. Tables sit in `TableCard`; empty states use `TableEmptyState`;
  KPIs use `StatCard` (one `tone="hero"` per row).
- **Colour-coded data** comes from one place: payment methods via
  `PaymentMethodLabel` / `PAYMENT_METHOD_DOT`, categories via
  `categoryTone(index)`.
- **Touch targets** on the till are at least 40px, and everywhere below 1024px.
- **Phones and tablets** (below `lg`, 1024px) get their styles only through
  `max-lg:` / `max-md:` / `max-sm:` variants, or a base class whose desktop
  value comes back at `lg:`. Nothing changes at 1024px and up. A grid that is
  one column below `lg` says `grid-cols-1`, or wide content (a chart, a table)
  widens the column past the screen.
- **Tables on a phone** never scroll sideways (the Cash book's days view and
  the expense spreadsheet are the exceptions). Low-priority columns fold into
  the main cell as a muted second line, and a row of icon actions becomes one
  `RowActionsMenu` below the fold width.
- **Date-range presets** (`ReportDateRangeBar`) are one dropdown below `sm`
  and the button row from `sm`. A page's phone-only extras (the Export CSV
  "⋯ More" menu) go in its `phoneActions` slot, beside the dropdown.
- **Behaviour that differs on a phone** asks `src/lib/utils/viewport.ts`
  (`isBelowDesktop`, `hasNoFinePointer`, `isInstalledApp`), never pointer type
  alone: the till may be a touchscreen PC.
- **The receipt is not part of the design system.**
  `src/components/pages/print/` and `receipt.css` stay monospace
  black-on-white for thermal printers.
- **The logo** comes from `BrandLogo` (pick `on="dark"` for the sidebar and
  other espresso surfaces) or `BrandMark` (the crimson tile, where the
  wordmark will not fit), never from a raw `<img>`. The receipt draws its own
  black `ReceiptLogo`. See `docs/brand/README.md`.
- **New shadcn components** (`npx shadcn add …`) arrive grayscale and without
  semicolons: run `npm run format`, then restyle them to the tokens.

## Code style

Prettier formats; ESLint finds bugs. They never overlap.

- **Prettier** (`.prettierrc.json`) runs with its defaults plus
  `prettier-plugin-tailwindcss`, which sorts Tailwind classes — including
  inside `cn()` and `cva()` — using the v4 theme in `globals.css`. Never
  hand-order classes.
- **ESLint** (`eslint.config.mjs`) extends `eslint-config-next`, with
  `eslint-config-prettier/flat` **last** so no rule fights Prettier. Do not add
  `eslint-plugin-prettier`; formatting is checked by `format:check`.
- **Line endings are LF** everywhere (`.gitattributes`), so Windows checkouts
  pass `format:check`.
- **VS Code** formats on save and applies ESLint fixes on save
  (`.vscode/settings.json`); install the recommended extensions.
- **Formatting-only commits** go in `.git-blame-ignore-revs`.
- Prefer canonical Tailwind classes (`size-4.5`, not `size-[18px]`).

## Naming

Components `PascalCase.tsx` · feature hooks `useItemsTab.ts` · global hooks
`use-debounce.ts` · `lib`/`server`/`db` files `kebab-case.ts` · types
`<domain>.types.ts`.

## Notable version facts

- **Next.js 16** — middleware is `src/proxy.ts`, not `middleware.ts`. Fonts come
  from `next/font/google` as CSS variables on `<html>` (`--font-geist-sans`,
  `--font-geist-mono`, `--font-bricolage`).
- **Tailwind v4.3** — no `tailwind.config.ts`; theme tokens live in
  `globals.css`. `scrollbar-none` and the other scrollbar utilities exist.
- **Zod 4** — use `z.uuid()`, not the deprecated `z.string().uuid()`. Money
  crosses the wire as a validated decimal **string**; a JSON number would be an
  IEEE-754 double and reintroduce the float bug.
- **big.js** — `Big.RM` is set to `roundHalfUp` once, in `money.ts`. Do not
  reconfigure it elsewhere; it is global to the library.
- **`numeric` columns come back as strings** from the Neon driver. Pass them
  through `toAmount()` to normalise `"60.5"` to `"60.50"` before display.
- **Auth.js v5 beta** — the JWT type must be augmented on **`@auth/core/jwt`**
  as well as `next-auth/jwt`, or every token field types as `unknown`.
- **Recharts 3** — `Cell` is deprecated; colour individual bars through the
  `Bar` `shape` prop (see `SalesTrendChart.tsx`).

## Verification

There is no test framework — a deliberate client decision. Verify with these:

```bash
npm run verify:offline   # money math, retry logic, reports, typecheck, lint, format
npm run verify:all       # the above plus all database checks
npm run build            # the production build
```

| Command                                               | Proves                                                                              |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `verify:money`                                        | exact rupee arithmetic and the shop-local midnight rollover                         |
| `verify:retry`                                        | cold-start retry fires once, and never on a real error                              |
| `verify:reports`                                      | date-range and CSV helpers                                                          |
| `format:check`                                        | every file is Prettier-formatted                                                    |
| `db:verify`                                           | CHECK constraints reject impossible bills                                           |
| `db:verify-immutability`                              | triggers reject history rewrites, but allow voiding                                 |
| `verify:bill`                                         | idempotency, price-change detection, one running number across days                 |
| `verify:stock-utils`                                  | stock status, caps, adjustment maths, filters (no DB)                               |
| `verify:stock`                                        | sale deduction, last-unit race, adjustments, history                                |
| `verify:cash-book-utils`                              | grouping, day merge, summary maths, expense validation, spreadsheet helpers (no DB) |
| `verify:split-payment`                                | split payment rules and the till's split maths (no DB)                              |
| `verify:menu-import`                                  | card is valid, adds no duplicate, replace is exact (no DB)                          |
| `verify:expenses`                                     | expense writes, cancellation, categories, cash book and spreadsheet totals          |
| `verify:categories` · `verify:items` · `verify:users` | admin actions and their guards                                                      |
| `verify:report-queries`                               | report SQL against real data; saves a test bill                                     |
| `db:audit-payments`                                   | every bill's payments add up; read-only, safe on live data                          |
| `verify:imagekit`                                     | image upload credentials                                                            |

The `db:*` and database `verify:*` checks run against whatever `DATABASE_URL`
points at. Run `npm run verify:all` before every deploy.

For UI changes, also look at the screen: run the dev server and check the page
at desktop and phone widths.

## Git

Work on a feature branch, never directly on `main`. Commit each finished task
on its own after `npm run typecheck` and `npm run lint` pass.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
