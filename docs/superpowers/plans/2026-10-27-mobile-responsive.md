# Mobile Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Part 1 removes the audit log from the app and the database (owner's
request, 2026-10-27). Part 2 makes every screen work on phones (360px up) and
tablets for owner and cashier, while laptop and desktop (1024px and up) stay
pixel-identical.

**Architecture (Part 1):** Delete the audit log end to end: the Audit page
and its menu link, every `writeAuditLog` call, the reprint-logging action,
the audit helpers, types and verify script, then the `audit_log` table
through a Drizzle migration. Nothing else changes behaviour.

**Architecture (Part 2):** Phone and tablet styles are added only through
`max-lg:` / `max-md:` / `max-sm:` Tailwind variants (or base classes whose
current value is restored at `lg:`), so desktop CSS is untouched. The till
gets a phone bill bar and a bottom sheet around the one existing
`CartPanel`; tables fold low-priority columns into a second line. A
Playwright harness outside the repo proves each page: layout checks at phone
and tablet sizes, and a pixel diff at desktop sizes against the branch-point
code running side by side on the same database.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4.3,
shadcn/ui on `radix-ui`, Drizzle + Neon Postgres. Testing uses the
Playwright 1.59.1 already installed at `C:\Users\MohammedFazil-PC\node_modules`
(harness only, outside the repo).

**Spec:** `docs/superpowers/specs/2026-10-24-mobile-responsive-design.md`
(Part 2). Part 1 has no separate spec: its decisions are listed under
Part 1 below.

## Global Constraints (Part 2)

- At 1024px and wider every page looks and behaves exactly as today; extra
  elements hidden at that width are fine, anything visible renders
  identically (spec §4).
- New phone and tablet styles go only in `max-lg:`, `max-md:`, `max-sm:`
  variants, or base classes whose current value comes back at `lg:` (§4).
- Behaviour that changes on a phone is gated on the viewport being below
  1024px; pointer type is never enough on its own (§4).
- Exactly one `CartPanel` in the DOM (§4).
- Layout is decided by CSS; JavaScript only adds behaviour after hydration
  (§4).
- Below 1024px, everything tappable is at least 40px tall and wide (§6.3).
- Below 1024px, no amount is ever truncated with an ellipsis (§6.9).
- Text fields stay at 16px below `md` (§6.10).
- No server action, query, service, schema, validation or money-path change
  (§3). Money stays a decimal string shown with `formatINR()`.
- Breakpoints are Tailwind's defaults: `sm` 640, `md` 768, `lg` 1024 (§5).
- Phone/tablet viewports: 360×640, 390×844, 412×915, 640×900, 768×1024.
  Desktop viewports: 1024×768, 1366×768, 1920×1080 (§5, §9).
- Test bills only on the development database in `.env.local`; never the
  live shop database (§9).
- Ember tokens, not hex; Prettier sorts classes; LF endings; no dependency
  added to `package.json` (CLAUDE.md, §9).
- Branch `feature/mobile-responsive` (rebased onto `test` after Part 1). One commit per task,
  after `npm run typecheck` and `npm run lint` pass. Commit messages end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus (Part 2)

1. **Six-figure amounts** (₹12,34,567.00) in KPI cards, the till total, the
   bill bar and table amount cells at 360px and 640px must fit, not clip.
   Pinned by the harness `stress` option (Task 1), used in Tasks 2, 4, 5, 6,
   7, 8.
2. **Keyboard open on a short phone** while typing tendered cash or split
   amounts in the bill sheet: the field and Save & Print stay reachable.
   Pinned by Task 4's `short-screen` state (360×340, split payment).
3. **Rotating or resizing across 768px with the sheet open** must not leave
   the menu `inert`, the page scroll-locked, or the bill hidden. Pinned by
   Task 4's `resize-closes` state.
4. **Back after Save & Print** must not land on the receipt and print again.
   Pinned by Task 15's `back-after-print` state.
5. **Long names** (a 45-character item, category or cashier name) must wrap
   in phone rows and till cards, not push the page sideways. Pinned by the
   harness `stressText` option in Tasks 3, 6, 10, 11, 12.

---

## Part 1 — Remove the audit log

The owner does not want changes logged, displayed or stored (2026-10-27).

**Decisions:**

- Everything that exists only for the audit log goes: the Audit page, its
  sidebar link and route, `writeAuditLog` and every call to it,
  `listAuditLog`, `reprintBillAction`, the `audit-actions` constants, the
  `audit-details` helpers and their verify script, the audit types, and the
  `audit_log` table with its indexes and foreign key. "No dead code" means
  also every variable, `before` read, transaction return value, import,
  prop and state that only fed a log entry.
- **Reprint** stops being an action. From the Bills preview it opens
  `/print/[id]` in a new tab straight away; from the bill details page it is
  a link to `/print/[id]`. The "Opening…" waiting labels go, because there
  is nothing to wait for. The receipt page still shows "not found" for a
  missing bill.
- **Sign-in lockout stays exactly as it is.** It lives on
  `users.failed_attempts` and `users.locked_until`, not in the log.
- **Kept, because they are not the audit log:** `stock_movements` (the stock
  history), the bill immutability triggers, `db:audit-payments` and
  `scripts/payment-audit/` (a payments consistency check), and the word
  "audit" where it means checking records ("laid out for audit", "the
  auditor's view").
- **Price history goes with the log.** Bills keep their snapshot prices, so
  receipts and reports are unaffected.
- **The table is dropped without a backup**, as the owner asked. Migration
  `0011` drops it on the development database now, and on any other
  database when it is next migrated.
- Old plans and feature specs stay as written (they are history); the
  product spec gets a dated amendment.
- Branch `feature/remove-audit-log`, cut from `test`; merged into `test`
  locally (no push) before Part 2 starts.

**Review focus (Part 1):**

1. **Sign-in lockout** still locks after 5 wrong passwords and clears on a
   good one. Pinned by Task A1 Step 2.
2. **Reprint from the Bills preview** opens the receipt and is not blocked
   as a pop-up: `window.open` runs directly in the click handler. Checked in
   Task A1 Step 9.
3. **The menu import** still runs with no audit rows to write. Pinned by
   Task A1 Step 8's dry run and `verify:menu-import` in `verify:offline`.
4. **Expense edits** still show "Edited": that flag comes from
   `updated_at`, not the log. Pinned by `verify:expenses` in Task A1 Step 8.
5. **A fresh database** still migrates from `0000` to `0011` cleanly, and
   `db-drop-all` still resets one that has not run `0011`. Checked by
   Task A2 Step 2's review of the generated SQL and the kept `IF EXISTS`
   line.

---

### Task A1: Remove the audit log from the code

**Files:**

- Delete: `src/app/(app)/administration/audit/page.tsx`
- Delete: `src/components/pages/administration/audit/` (`AuditLogTab.tsx`,
  `AuditLogColumns.tsx`, `components/AuditDiffDialog.tsx`)
- Delete: `src/server/audit/` (`write-audit-log.ts`, `audit-queries.ts`)
- Delete: `src/types/audit.types.ts`, `src/lib/utils/audit-details.ts`,
  `src/constants/audit-actions.ts`, `scripts/verify-audit-details.ts`
- Modify: `src/components/layout/navigation.ts` (the Audit link and the
  `ShieldCheck` import), `src/lib/routes/administration-routes.ts` (`audit`)
- Modify: `src/server/bills/bills-actions.ts` (delete `reprintBillAction`;
  `getBillReceiptAction`'s comment no longer mentions audit entries)
- Modify: `src/components/pages/bills/hooks/useBillPreview.ts`,
  `components/BillPreviewDialog.tsx`, `BillsTab.tsx` (no `isReprinting`)
- Modify: `src/components/pages/bills/bill-details/BillDetails.tsx`
- Modify: `src/server/items/items-actions.ts`,
  `src/server/categories/categories-actions.ts`,
  `src/server/users/users-actions.ts`, `src/server/users/login-attempts.ts`,
  `src/server/settings/settings-actions.ts`,
  `src/server/expenses/expenses-service.ts`,
  `src/server/stock/stock-service.ts`
- Modify: `src/db/schema/expenses.ts` (the "each edit is audited" comment)
- Modify: `scripts/import-menu.ts` (no audit rows),
  `scripts/menu-import/menu-card-2026-08-11.ts` (`MENU_CARD_SOURCE`'s
  comment: it now only names the card in the import summary)
- Modify: `scripts/verify-items.ts`, `scripts/verify-stock.ts`,
  `scripts/verify-users.ts`, `scripts/verify-expenses.ts` (drop the checks
  that assert audit rows; keep every other check)
- Modify: `package.json` (`verify:audit-details` and its place in
  `verify:offline`)

**Interfaces:**

- Produces: `useBillPreview()` returns everything it does today except
  `isReprinting`; `reprint()` is synchronous and calls
  `window.open(REPORT_ROUTES.print(id), "_blank")`. `BillPreviewDialog` loses
  its `isReprinting` prop. Part 2's Task 6 builds on this `reprint()`.
- After this task the only code naming the audit log is the schema file
  `src/db/schema/audit-log.ts`, its export in `src/db/schema/index.ts`, and
  raw SQL against the table in `scripts/verify-expenses.ts` (test cleanup),
  `scripts/show-state.ts`, `scripts/dump-json.ts` and
  `scripts/db-drop-all.ts`. Task A2 removes those.

- [ ] **Step 1: Branch and record the starting point**

```bash
git checkout test
git checkout -b feature/remove-audit-log
npx tsc --noEmit --noUnusedLocals --noUnusedParameters > ../unused-before.txt
```

The last file is outside the repo; Step 6 compares against it.

- [ ] **Step 2: Pin the sign-in lockout before touching it**

Add a check to `scripts/verify-users.ts`, using the file's existing probe
and `check()` pattern: a probe user; `registerFailedLogin(username)` called
`MAX_FAILED_ATTEMPTS` (5) times; then `failedAttempts === 5` and
`lockedUntil` is in the future (check name: `five wrong passwords lock the
account`); then `clearFailedLogins(id)`; then `failedAttempts === 0` and
`lockedUntil === null` (check name: `a successful sign-in clears the
lock`). Clean the probe up the way the file's other probes are.
Run: `npm run verify:users`
Expected: PASS, before any removal (it pins today's behaviour).

- [ ] **Step 3: Run the removal check and see it fail**

Run: `git grep -n -E "writeAuditLog|audit-actions|AuditAction|AUDIT_ACTION|audit-details|audit\.types|server/audit|reprintBillAction|isReprinting|ADMIN_ROUTES\.audit|administration/audit|verify:audit-details" -- src scripts package.json`
Expected: many matches.

- [ ] **Step 4: Delete the files and the call sites**

Delete the files listed above. In every modified file, remove the
`writeAuditLog` call and then whatever only fed it, for example: the
`getShopSettings()` reads in `settings-actions.ts`; `editable()` in
`expenses-service.ts`; `placedAt` returned from the item transactions when
nothing else uses it; the `LOCKOUT_MINUTES` / `MAX_FAILED_ATTEMPTS`
re-export and its comment in `login-attempts.ts` (nothing imports them from
there). A `before` read that also guards a not-found or conflict check
stays. `BillDetails`' Reprint becomes `<Button asChild>` around
`<Link href={REPORT_ROUTES.print(billId)}>`, with the same icon and label,
and its transition, toast and router imports go if nothing else uses them.

- [ ] **Step 5: Run the removal check and see it pass**

Run: the Step 3 `git grep` command.
Expected: no matches.

- [ ] **Step 6: Typecheck, lint, format, offline checks, build**

Run: `npx next typegen` (refreshes `.next/types` after the deleted route),
then `npm run verify:offline`, then `npm run build`.
Expected: all pass; the build's route list has no `/administration/audit`.

- [ ] **Step 7: Check for dead code**

Run: `npx tsc --noEmit --noUnusedLocals --noUnusedParameters > ../unused-after.txt`
Expected: `../unused-after.txt` has no line that `../unused-before.txt`
lacks. ESLint (Step 6) already reports unused imports.

- [ ] **Step 8: Run the database checks**

Run: `npm run verify:items`, `npm run verify:stock`, `npm run verify:users`,
`npm run verify:expenses`, `npm run verify:categories`, `npm run verify:bill`,
`npm run db:import-menu -- --dry-run`
Expected: all pass, including Step 2's two lockout checks; the dry run
previews without errors (development database, allowed).

- [ ] **Step 9: Look at the app**

With `npm run dev`, as owner: the sidebar's Manage section reads Items,
Categories, Accounts, Settings; `/administration/audit` shows the not-found
page; Reprint in the Bills preview opens the receipt in a new tab; Reprint on
a bill's page opens its receipt.

- [ ] **Step 10: Commit**

```bash
git add -A src scripts package.json
git commit -m "refactor: remove the audit log from the app"
```

---

### Task A2: Drop the `audit_log` table

**Files:**

- Delete: `src/db/schema/audit-log.ts`
- Modify: `src/db/schema/index.ts` (its export)
- Create: `src/db/migrations/0011_drop_audit_log.sql` and its
  `meta/0011_snapshot.json` and `_journal.json` entry (generated)
- Modify: `scripts/verify-expenses.ts` (the `DELETE FROM audit_log` cleanup),
  `scripts/show-state.ts` (the recent audit log section),
  `scripts/dump-json.ts` (`"audit_log"` in `TABLES`)
- Modify: `scripts/db-drop-all.ts`: keep `DROP TABLE IF EXISTS audit_log
CASCADE` (a database that has not run `0011` yet still has the table, and
  re-running `0000` would collide with it) and say so in a comment.

- [ ] **Step 1: Confirm the table exists**

Write a one-off script outside the repo, `../check-audit-table.ts`, that
imports `db` from the repo's `src/db` and prints the result of
`select to_regclass('public.audit_log') as t`. Run it with
`npx tsx --env-file=.env.local ../check-audit-table.ts`.
Expected: `{ t: 'audit_log' }`.

- [ ] **Step 2: Remove the schema and generate the migration**

Delete the schema file and its export, then
`npm run db:generate -- --name drop_audit_log`.
Expected: a new `0011_drop_audit_log.sql` whose only statements drop the
`audit_log` foreign key, its three indexes and the table (dropping the table
covers the indexes). Nothing else in the file. If drizzle-kit asks a
question, the answer must keep every other table as it is.

- [ ] **Step 3: Clean the scripts** listed above.

- [ ] **Step 4: Migrate the development database**

Run: `npm run db:migrate`, then the Step 1 command.
Expected: migrate applies `0011`; the check prints `{ t: null }`.

- [ ] **Step 5: Run everything**

Run: `git grep -n -i -E "audit_log|auditLog" -- src scripts ":!src/db/migrations"`
Expected: only `scripts/db-drop-all.ts`. Then delete `../check-audit-table.ts`.
Run: `npx next typegen`, `npm run verify:all`, `npm run build`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A src/db scripts
git commit -m "feat(db): drop the audit_log table"
```

---

### Task A3: Docs, then merge into `test`

**Files:**

- Modify: `README.md` (the audit log feature bullet)
- Modify: `docs/deployment.md` (the menu import "audit log as System" line;
  a note that migration `0011` permanently drops `audit_log` when it runs on
  a database)
- Modify: `CLAUDE.md` (the `verify:audit-details` row in Verification)
- Modify: `docs/superpowers/specs/2026-08-23-fastfood-billing-design.md`:
  §6.8's heading gets "(removed 2026-10-27)" and its body becomes one
  paragraph saying the owner asked for the audit log to be removed; the
  `View audit log` permission row, the `/manage/audit` route row and the
  audit lines of the directory tree are deleted; the §9 reprint sentence and
  the "Every create, update and delete writes to `audit_log`" line say that
  reprints and changes are not logged. Milestone history (M4, M6) stays.

- [ ] **Step 1: Run the docs check and see it fail**

Run: `git grep -n -i -E "audit log|audit_log|verify:audit-details" -- README.md CLAUDE.md docs/deployment.md`
Expected: matches.

- [ ] **Step 2: Edit the docs** as listed.

- [ ] **Step 3: Run the docs check and see it pass**

Run: the Step 1 command.
Expected: only the new `0011` note in `docs/deployment.md`.
Run: `npm run format:check`. Expected: pass.

- [ ] **Step 4: Commit and merge**

```bash
git add README.md CLAUDE.md docs
git commit -m "docs: the audit log is removed"
git checkout test
git merge --no-ff feature/remove-audit-log -m "Merge feature/remove-audit-log: remove the audit log from the app and the database"
git checkout feature/mobile-responsive
git rebase test
```

Expected: the merge and the rebase finish without conflicts (Part 2's two
docs commits touch no Part 1 file). Nothing is pushed.

---

## Part 2 — Mobile responsive

### Task 1: The QA harness and the desktop baseline

No repo commit: everything here lives outside the repo (spec §9).

**Files:**

- Create: `D:\Fazil Projects\Freelance\Billing-qa\playwright.mjs`: loads
  the Playwright already installed on this PC, v1.59.1, with
  `createRequire("C:/Users/MohammedFazil-PC/node_modules/")` and re-exports
  `chromium` (its Chromium 1217 is already downloaded). Nothing is
  installed; `Billing-qa` has no `package.json` dependencies.
- Create: `D:\Fazil Projects\Freelance\Billing-qa\run.mjs` (CLI)
- Create: `D:\Fazil Projects\Freelance\Billing-qa\checks.mjs`
- Create: `D:\Fazil Projects\Freelance\Billing-qa\routes.mjs`
- Create: `D:\Fazil Projects\Freelance\Billing-qa\setup.mjs`
- Create: `D:\Fazil Projects\Freelance\Billing-baseline\` (a
  `git worktree add --detach` of `test` after Task A3 merged the audit log
  removal, with `.env.local` copied in and `npm ci` run)

**Interfaces:**

- Produces, for every later task:
  - `node run.mjs <route|all> [--phone|--desktop]`, run from `Billing-qa`.
    Exit 0 and `PASS <route>` when clean; otherwise exit 1 and one line per
    failure: `FAIL <route> <state> <role> <w>x<h> <check>: <detail>`.
  - Screenshots in `Billing-qa/out/<route>/<state>/<role>-<w>x<h>.png`;
    a failed desktop diff saves `.../baseline-<w>x<h>.png` and
    `.../current-<w>x<h>.png`.
  - A route entry shape that later tasks extend with states:

```js
{
  name: "bills",
  path: "/bills",              // or async (ctx) => `/bills/${ctx.firstBillId}`
  roles: ["owner", "cashier"], // or ["anonymous"]
  states: [
    {
      name: "default",
      viewports: "all",        // "all" | "phone" | "desktop"
      sideScroll: "forbidden", // "allowed" skips the table-container check
      stress: false,           // true: every visible .tabular-nums whose text
                               // starts with "₹" becomes "₹12,34,567.00"
      stressText: [],          // [{ selector, text }] replaced before checks
      setup: async (page, ctx) => {}, // opens dialogs, adds items, …
      assert: async (page, ctx) => [], // returns failure strings
      initScript: undefined,   // passed to page.addInitScript
    },
  ],
}
```

- Contexts: phone/tablet contexts use `isMobile: true, hasTouch: true`;
  desktop contexts use neither. All contexts use `reducedMotion: "reduce"`,
  an init script that hides `nextjs-portal` (the Next dev badge) and
  replaces `window.print` with a counter at `window.__printed`.
- `ctx` carries `{ server: "current" | "baseline", role, viewport,
firstBillId }`.

- [ ] **Step 1: Start both servers**

In the repo: `npm run dev` (port 3000, run in the background).
Create the baseline: `git worktree add --detach "../Billing-baseline" test`,
copy `.env.local` into it, `npm ci` there, then start it in the background
with `AUTH_URL=http://localhost:3001 npx next dev -p 3001` (process env wins
over `.env.local`, so sign-in redirects stay on 3001).
Expected: both `http://localhost:3000/login` and `http://localhost:3001/login`
load.

- [ ] **Step 2: Write `setup.mjs`**

Reads `SEED_SUPERADMIN_USERNAME` / `SEED_SUPERADMIN_PASSWORD` from
`../Billing/.env.local` without printing them. Signs in as owner on each
server (`#username`, `#password`, submit) and saves
`.auth/<server>-owner.json`. On 3000, if the Accounts table has no
`qa-cashier`, creates it through New account (Full name `QA Cashier`,
Username `qa-cashier`, Role `Cashier`, a random 16-character password saved
to `Billing-qa/.env` as `QA_CASHIER_PASSWORD`); then saves
`.auth/<server>-cashier.json` for both servers. Signs in once per role per
server; never retries a failed sign-in (the app locks accounts).
Also confirms the dev database has at least one bill, one expense, one item
with stock tracking on; if there is no bill, saves one
through the till at 1366×768. Stores the newest bill's id as `firstBillId`.

- [ ] **Step 3: Write `checks.mjs`**

Four checks, run only at phone/tablet viewports:

- `sideScroll`: fails if `document.documentElement.scrollWidth >
innerWidth`, or (unless the state allows it) any visible
  `[data-slot=table-container]` has `scrollWidth > clientWidth + 1`.
- `touchTargets`: candidates are `button:not([role=switch])`,
  `[role=button]`, `[role=tab]`, `[role=combobox]`, `[role=menuitem]`,
  `[role=option]`, `a[data-slot=button]`, `input:not([type=hidden])`,
  `textarea`. Skips elements with a zero-size rect, `visibility: hidden`,
  inside `[inert]` or `[aria-hidden=true]`, or clipped to 1px (`sr-only`).
  For inputs and textareas, measures the larger of the field and its
  closest `label`. Fails if width or height is under 39.5px; the detail
  names the element's text or `aria-label` and its size.
- `amountsFit`: every visible `.tabular-nums` element whose text contains
  `₹` fails if `scrollWidth > clientWidth + 1`, or if its rect extends past
  the rect of any ancestor whose `overflow` is not `visible`.
- `fieldFont`: below 768px, every visible text `input` and `textarea` fails
  if its computed `font-size` is under 16px (spec §6.10).

At desktop viewports the only check is the diff: screenshot the same state
on 3001 (baseline) and 3000 (current), each stabilised by re-shooting until
two consecutive full-page shots match (at most 6 tries, 500ms apart), then
compare the two PNG buffers byte for byte (same machine, same Chromium, so
identical pixels give identical bytes). Any difference fails, and the pair
is saved as `baseline-<w>x<h>.png` and `current-<w>x<h>.png` to look at.

- [ ] **Step 4: Write `routes.mjs` with a `default` state for every route**

| name             | path                                    | roles          | default state notes      |
| ---------------- | --------------------------------------- | -------------- | ------------------------ |
| login            | `/login`                                | anonymous      |                          |
| dashboard        | `/dashboard`                            | owner, cashier |                          |
| bill             | `/bill`                                 | owner, cashier |                          |
| bills            | `/bills`                                | owner, cashier |                          |
| bill-details     | `/bills/${firstBillId}`                 | owner, cashier |                          |
| print            | `/print/${firstBillId}`                 | owner, cashier |                          |
| sales            | `/reports/sales`                        | owner, cashier |                          |
| items-report     | `/reports/items`                        | owner, cashier |                          |
| cash-book        | `/administration/cash-book`             | owner          |                          |
| cash-book-days   | `/administration/cash-book?view=days`   | owner          | `sideScroll: "allowed"`  |
| spreadsheet      | `/administration/cash-book/spreadsheet` | owner          | `sideScroll: "allowed"`  |
| items            | `/administration/items`                 | owner          |                          |
| categories       | `/administration/categories`            | owner          |                          |
| users            | `/administration/users`                 | owner          |                          |
| settings         | `/administration/settings`              | owner          |                          |
| not-found        | `/no-such-page`                         | owner          |                          |
| admin-as-cashier | `/administration/items`                 | cashier        | the "Not allowed" screen |

- [ ] **Step 5: Run the desktop diff for everything**

Run: `node run.mjs all --desktop`
Expected: `PASS` for every route (no code has changed yet). A failure here
means the harness is not stable; fix the harness before moving on.

- [ ] **Step 6: Record the phone baseline report**

Run: `node run.mjs all --phone > out/initial-report.txt`
Expected: exit 1 with failures, among them `bills … sideScroll`,
`bill … touchTargets` (the cart's 34px buttons) and `categories …
touchTargets` (36px icon buttons). This file is the starting list each page
task works down.

---

### Task 2: Shared foundations

**Files:**

- Modify: `src/app/layout.tsx` (add a `viewport` export)
- Modify: `src/components/ui/button.tsx` (sizes `sm`, `icon`, `icon-sm`)
- Modify: `src/components/ui/select.tsx` (`SelectTrigger` size `sm`,
  `SelectItem`)
- Modify: `src/components/ui/dropdown-menu.tsx` (`DropdownMenuItem` and the
  checkbox/radio items)
- Modify: `src/components/ui/dialog.tsx`, `src/components/ui/alert-dialog.tsx`
- Modify: `src/components/layout/MobileNav.tsx`,
  `src/components/layout/AppSidebar.tsx`
- Modify: `src/components/custom/StatCard.tsx`
- Create: `src/lib/utils/viewport.ts`
- Test: `Billing-qa/routes.mjs` (states below)

**Interfaces:**

- Produces `src/lib/utils/viewport.ts`, client-only (call inside effects
  and event handlers, never during render):
  - `isBelowDesktop(): boolean` — `(max-width: 1023.98px)` matches.
  - `hasNoFinePointer(): boolean` — `(any-pointer: fine)` does not match.
  - `isInstalledApp(): boolean` — `(display-mode: standalone)` matches.
- After this task, every `Button` of size `sm`, `icon` or `icon-sm`, every
  `SelectTrigger size="sm"`, `SelectItem` and `DropdownMenuItem` is at least
  40px below `lg`. Later tasks rely on this and do not resize them again.

- [ ] **Step 1: Add the test states**

In `routes.mjs`: on `dashboard`, a `stress` state (`stress: true`,
viewports `phone`); on `categories`, a `new-category` state whose `setup`
clicks New category. On `dashboard` and `bills` add an `assert` that reads
`meta[name=theme-color]` (expect `#1c1714`) and `meta[name=viewport]`
(expect it to contain `interactive-widget=resizes-content`). On `bill` add
an `assert` at phone viewports that the top bar (`header` with the Open menu
button) contains no `New bill` link; on `dashboard` assert it does.

- [ ] **Step 2: Run and see it fail**

Run: `node run.mjs dashboard --phone` and `node run.mjs categories --phone`
and `node run.mjs bill --phone`
Expected: FAIL on the meta tags, on `amountsFit` in the stress state at
640×900, on the 32px dialog close button in `new-category`, and on the
`New bill` link in the till's top bar.

- [ ] **Step 3: Implement**

- `layout.tsx`: `export const viewport: Viewport` with `themeColor:
"#1c1714"` and `interactiveWidget: "resizes-content"`; a comment that
  the colour is `--sidebar`, as in `manifest.ts`.
- Button, Select, DropdownMenu: add `max-lg:` sizes so each listed size
  reaches 40px (`max-lg:h-10` / `max-lg:size-10` / `max-lg:min-h-10`).
- Dialog and AlertDialog: below `sm`, content padding `p-5` and the
  footer's negative margins and padding to match.
- `MobileNav`: hide the New bill link when `usePathname()` is
  `NEW_BILL_HREF`; drawer close button 40px.
- `AppSidebar`: the expanded sign-out button gets `max-lg:size-10` (the
  expanded sidebar is only below `lg` inside the drawer).
- `StatCard`: below `lg`, the value is a container-query size between 18px
  and its current size (26px compact, 34px normal), scaled to the card's
  width, and never ellipsizes: it wraps as the last resort. At `lg` and up
  the existing `truncate` and sizes apply unchanged.

- [ ] **Step 4: Run and see it pass**

Run: `node run.mjs dashboard --phone`, `node run.mjs categories --phone`,
`node run.mjs bill --phone`
Expected: the Step 2 failures are gone (page-specific failures from
`out/initial-report.txt` may remain).
Run: `node run.mjs all --desktop`
Expected: PASS for every route.

- [ ] **Step 5: Look at the screens**

Open `out/dashboard/stress/*.png` and `out/categories/new-category/*.png`:
values fit their cards, the dialog close button sits clear of the title.

- [ ] **Step 6: Typecheck, lint, format, commit**

Run: `npm run typecheck && npm run lint && npm run format:check`
Expected: no errors.

```bash
git add src/app/layout.tsx src/components/ui src/components/layout src/components/custom/StatCard.tsx src/lib/utils/viewport.ts
git commit -m "feat(responsive): shared touch targets, viewport and KPI sizing for phones"
```

---

### Task 3: The till on tablets, and search on phones

**Files:**

- Modify: `src/components/pages/bill/BillPage.tsx` (grid classes)
- Modify: `src/components/pages/bill/components/MenuGrid.tsx`
- Modify: `src/components/pages/bill/components/ItemSearchBox.tsx`
- Modify: `src/components/pages/bill/components/CartPanel.tsx` (`md:h-full`)
- Test: `Billing-qa/routes.mjs` (`bill` route)

**Interfaces:**

- Consumes: `isBelowDesktop()`, `hasNoFinePointer()` from Task 2.
- Produces: at 768–1023px `BillPage` is a two-column grid with a 320px bill
  column, pinned to `calc(100dvh - 3.5rem)` (the top bar is `h-14`). Task 4
  wraps `CartPanel` without changing this.

- [ ] **Step 1: Add the test states**

On `bill`: a `with-items` state (viewports `all`) whose `setup` clicks the
first two enabled buttons inside `section[aria-label=Menu]` that contain a
`₹` price, with `stressText` setting the first card's name to
`Paneer Tikka Butter Masala Special Cheese Combo`. Its `assert`:

- at 768×1024: the bill (`aside[aria-label="Current bill"]`) starts to the
  right of the menu section and its Save & Print button's bottom is within
  the viewport without scrolling;
- at phone and 768 viewports: `document.activeElement` is not the
  `Search menu items` input 500ms after load;
- at phone viewports: after `window.scrollTo(0, 800)` the search input's
  top is between 56px and 120px (sticky under the 56px top bar).

Add a `desktop-focus` state (viewports `desktop`) asserting the search
input _is_ focused after load.

- [ ] **Step 2: Run and see it fail**

Run: `node run.mjs bill`
Expected: FAIL at 768×1024 (the bill is under the menu), on focus at phone
viewports, and on the sticky search.

- [ ] **Step 3: Implement**

- `BillPage` grid: add `md:h-[calc(100dvh-3.5rem)]
md:grid-cols-[minmax(0,1fr)_320px] md:overflow-hidden`, keeping every
  `lg:` and `xl:` class as is.
- `MenuGrid`: the ScrollArea's `lg:-mr-3` and the grid's `lg:pr-3` also
  apply from `md`; card columns become `grid-cols-2 sm:grid-cols-3
md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`. Wrap the
  search box and category chips in one div that is `max-md:sticky
max-md:top-14 max-md:z-30` with a `bg-background` band and the section's
  `gap-4` between its children, and is `md:contents` so the desktop DOM
  box structure is unchanged.
- `ItemSearchBox`: in the focus effect, skip `focus()` when
  `isBelowDesktop() && hasNoFinePointer()`.
- `CartPanel`: `md:h-full` beside `lg:h-full`.

- [ ] **Step 4: Run and see it pass**

Run: `node run.mjs bill`
Expected: PASS for `default`, `with-items` and `desktop-focus` at every
viewport, including the desktop diff of `with-items`.

- [ ] **Step 5: Look at the screens**

`out/bill/with-items/*-768x1024.png`: menu and bill side by side, two card
columns, long name wraps inside its card.

- [ ] **Step 6: Typecheck, lint, format, commit**

```bash
git add src/components/pages/bill
git commit -m "feat(responsive): till side by side on tablets, no keyboard pop-up on phones"
```

---

### Task 4: The till's phone bill bar and bottom sheet

**Files:**

- Create: `src/components/pages/bill/hooks/useBillSheet.ts`
- Create: `src/components/pages/bill/components/BillBar.tsx`
- Create: `src/components/pages/bill/components/BillSheet.tsx`
- Modify: `src/components/pages/bill/BillPage.tsx`
- Modify: `src/components/pages/bill/components/CartPanel.tsx`,
  `CartLine.tsx` (40px buttons below `md`)
- Test: `Billing-qa/routes.mjs` (`bill` route)

**Interfaces:**

- Consumes: Task 3's grid; `CartPanel`'s existing props, unchanged.
- Produces:
  - `useBillSheet(): { open: boolean; openSheet: () => void; closeSheet:
() => void }`. `openSheet` pushes a same-URL history entry carrying
    `billSheet: true` and sets `open`; a `popstate` sets `open` false;
    `closeSheet` calls `history.back()` when the current entry is ours,
    else just sets `open` false. A `(min-width: 768px)` media listener
    closes the sheet. While open, `document.body` scroll is locked; the lock
    is released on close and on unmount. Read the "Native History API"
    section of `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
    first.
  - `BillBar({ itemCount, total, expanded, onOpen }: { itemCount: number;
total: string; expanded: boolean; onOpen: () => void })`: `md:hidden`,
    fixed to the bottom with `env(safe-area-inset-bottom)` padding; one
    button, `aria-expanded={expanded}`, `aria-controls="current-bill"`;
    with 0 items it reads `No items yet` and is disabled, otherwise
    `{n} item(s)`, `formatINR(total)` and `View bill`. Exposes a ref (or
    `id`) so focus can return to it.
  - `BillSheet({ open, onClose, children }: { open: boolean; onClose: ()
=> void; children: React.ReactNode })`: at `md` and up it is
    `md:contents` and renders only `children` visibly. Below `md` it is a
    bottom panel (`id="current-bill"`, rounded top, at most `90dvh`,
    scrolls inside) with a dimmed overlay (`bg-sidebar/45`, tap closes), a
    handle bar and a 40px close button. Closed, it is off-screen and
    `max-md:invisible` purely through CSS, so it is out of the tab order on
    first paint. Open: `role="dialog"`, `aria-modal`, labelled by the
    `Current bill` heading; focus moves into it; Tab and Shift+Tab cycle
    inside it; Escape calls `onClose`.
- `BillPage` renders `<BillSheet>` around the one `CartPanel`, sets `inert`
  on the menu section and the bar while the sheet is open, and returns focus
  to the bar on close. Below `md` it pads the page bottom by
  `calc(6rem + env(safe-area-inset-bottom))`.

- [ ] **Step 1: Add the test states** (all phone-only unless noted)

- `bar-empty`: the bar reads `No items yet` and is disabled; the bill is
  not visible (`visibility: hidden` or outside the viewport).
- `sheet`: add one item; the bar reads `1 item` and the item's price; tap
  it; assert the bill is inside the viewport, the menu section has `inert`,
  `document.activeElement` is inside `#current-bill`; press Escape; assert
  the bill is hidden and focus is on the bar button. Then reopen with
  `stress: true` checks running against the open sheet.
- `back-closes`: add one item, open the sheet, `page.goBack()`; assert the
  bill is hidden, the URL still ends in `/bill`, and the bar still reads
  `1 item`.
- `resize-closes`: open the sheet at 390×844, then `setViewportSize` to
  1024×768; assert the menu section is not `inert`, `body` overflow is not
  `hidden`, and the bill is visible beside the menu.
- `short-screen` (viewport 360×340): add two items, open the sheet, choose
  Split if shown (else Cash), focus the first amount field; assert Save &
  Print can be scrolled into view inside the sheet and the sheet's top is
  at or below 0.
- `save-print`: add one item, open the sheet, choose Cash, Save & Print;
  assert the URL matches `/print/` and `window.__printed >= 1` within 2s.
- At 768×1024 and desktop: the bar is not rendered visibly; `with-items`
  from Task 3 still passes its desktop diff.

- [ ] **Step 2: Run and see it fail**

Run: `node run.mjs bill --phone`
Expected: FAIL in every new state (no bar exists), and `touchTargets` on
the cart's 34px buttons.

- [ ] **Step 3: Implement** the three new files and the `BillPage` wiring
      per the Interfaces block; `CartLine`'s step and remove buttons become 40px
      below `md` (`max-md:size-10`).

- [ ] **Step 4: Run and see it pass**

Run: `node run.mjs bill`
Expected: PASS at every viewport, desktop diffs included.

- [ ] **Step 5: Check the price-change path by hand**

At 390×844 in the dev server: as cashier, add an item and open the sheet;
in another browser as owner, change that item's price; back on the phone,
Save & Print. Expected: the Prices changed dialog shows above the sheet and
`Charge the new total` saves the bill.

- [ ] **Step 6: Look at the screens**

`out/bill/sheet/*.png`, `out/bill/short-screen/*.png`: the sheet reads as
the existing bill panel with a handle; nothing clipped.

- [ ] **Step 7: Typecheck, lint, format, commit**

```bash
git add src/components/pages/bill
git commit -m "feat(responsive): phone bill bar and bottom sheet at the till"
```

---

### Task 5: Dashboard

**Files:**

- Modify: `src/components/pages/dashboard/components/SalesTrendChart.tsx`
  and any of `DashboardPage.tsx`, `TopItemsCard.tsx`, `StockAlertsCard.tsx`
  that the checks flag
- Test: `Billing-qa/routes.mjs` (`dashboard`)

- [ ] **Step 1: Add the test state**

`chart-tap` (phone): tap the first `.recharts-bar-rectangle`; assert
`.recharts-tooltip-wrapper` is visible and inside the viewport.

- [ ] **Step 2: Run** `node run.mjs dashboard` and note the failures.

- [ ] **Step 3: Implement**: chart card padding `max-sm:p-4`; fix whatever
      Step 2 reported, within the Global Constraints.

- [ ] **Step 4: Run** `node run.mjs dashboard`. Expected: PASS, desktop
      included.

- [ ] **Step 5: Look** at `out/dashboard/**/*-360x640.png`: axis labels
      readable, no clipped labels.

- [ ] **Step 6: Typecheck, lint, format, commit**
      (`feat(responsive): dashboard on phones`).

---

### Task 6: Bills, bill details, preview, and reprint in the installed app

**Files:**

- Modify: `src/components/pages/bills/BillsColumns.tsx`, `BillsTab.tsx`
- Modify: `src/components/pages/bills/components/BillsTableToolbar.tsx`
- Modify: `src/components/pages/bills/bill-details/BillDetails.tsx`
- Modify: `src/components/pages/bills/hooks/useBillPreview.ts`
- Test: `Billing-qa/routes.mjs` (`bills`, `bill-details`)

**Interfaces:**

- Consumes: `isInstalledApp()`, `isBelowDesktop()` from Task 2.
- `BILL_COLUMNS` entries gain the visibility class used by both the header
  and the cell (one definition per column, as the file's comment requires).

- [ ] **Step 1: Add the test states**

- `bills/default` gets `stress: true` at phone viewports and `stressText`
  setting every cashier name to `Mohammed Abdul Rahman Siddiqui Khan`.
- `bills/preview`: click the first `Preview bill` button.
- `bills/browser-reprint` (390×844): open the preview, click Reprint;
  assert a `popup` event fires (unchanged behaviour).
- `bills/installed-reprint` (390×844, `initScript` makes
  `matchMedia("(display-mode: standalone)").matches` true): open the
  preview, click Reprint; assert no `popup` event within 2s and the page
  URL becomes `/print/<that bill's id>`.
- `bill-details/default` with `stressText` setting the first item name to
  `Paneer Tikka Butter Masala Special Cheese Combo`.

- [ ] **Step 2: Run and see it fail**

Run: `node run.mjs bills` and `node run.mjs bill-details`
Expected: `sideScroll` on the Bills table; toolbar `touchTargets`/width
failures; `installed-reprint` fails (a popup opens).

- [ ] **Step 3: Implement**

- Bills table folds below `lg`: visible columns are Bill, Total and
  Preview. Under the bill number (below `lg`): a Void badge when voided,
  then `date · cashier · n items`. Under the total (below `lg`): the
  `PaymentMethodLabel`; the total is right-aligned below `lg`. Date,
  Cashier, Items, Payment and Status are `hidden lg:table-cell`.
- Toolbar below `sm`: a two-column grid (From | To, Cashier | Payment, Bill
  # spanning both), fields full width; `sm:` and up restores today's widths.
- Bill details items table below `sm`: Unit price hidden and shown under
  the name as `₹x each`; the name cell wraps (`max-sm:whitespace-normal`).
- `useBillPreview.reprint` (simplified in Task A1 to open
  `REPORT_ROUTES.print(id)` in a new tab): when
  `isInstalledApp() && isBelowDesktop()`, `router.push` there in the same
  tab instead. Every other case is unchanged.

- [ ] **Step 4: Run** both routes. Expected: PASS, desktop diffs included.

- [ ] **Step 5: Look** at `out/bills/default/*-360x640.png`: two-line rows,
      totals and Void badges visible.

- [ ] **Step 6: Typecheck, lint, format, commit**
      (`feat(responsive): bills list, details and reprint on phones`).

---

### Task 7: Reports — date range bar, Sales, What's selling

**Files:**

- Modify: `src/components/pages/reports/components/ReportDateRangeBar.tsx`
- Modify: `src/components/pages/reports/sales/SalesReportColumns.tsx`,
  `SalesReportTab.tsx`
- Modify: `src/components/pages/reports/items/ItemReportColumns.tsx`,
  `ItemReportTab.tsx`
- Test: `Billing-qa/routes.mjs` (`sales`, `items-report`)

- [ ] **Step 1: Add the test states**: `stress: true` on both defaults at
      phone viewports; an `assert` that below `sm` each preset button is at least
      40px tall and the From and To inputs are each at least
      `(viewportWidth - 32) / 2 - 16` px wide.

- [ ] **Step 2: Run** `node run.mjs sales` and `node run.mjs items-report`.
      Expected: FAIL on the date bar and the tables.

- [ ] **Step 3: Implement**

- Date bar below `sm`: presets fill the width (a wrapping grid, buttons
  40px); From and To become two equal columns, each label above its input.
  Wrap each label-and-input pair in a div that is `sm:contents`, so desktop
  boxes are unchanged.
- Sales table folds below `sm`: Bills and Discount under the date; visible
  Date, Gross, Net. The Total row folds the same way.
- What's selling folds below `sm`: Category and the share bar under the
  item name; visible Item, Qty sold, Revenue.

- [ ] **Step 4: Run** both routes. Expected: PASS, desktop included.

- [ ] **Step 5: Look** at `out/sales/**/*-640x900.png`: three KPIs fit.

- [ ] **Step 6: Typecheck, lint, format, commit**
      (`feat(responsive): reports on phones`).

---

### Task 8: Cash book

**Files:**

- Create: `src/components/pages/reports/hooks/useCsvExport.ts`
- Modify: `src/components/pages/reports/components/ExportCsvButton.tsx`
  (uses the hook; looks and behaves as today)
- Modify: `src/components/pages/administration/cash-book/CashBookTab.tsx`
- Modify: `.../cash-book/components/ExpensesTableToolbar.tsx`,
  `CashBookViewTabs.tsx`, and the expense, categories and cancel dialogs
  only where the checks flag them
- Test: `Billing-qa/routes.mjs` (`cash-book`, `cash-book-days`)

**Interfaces:**

- Produces `useCsvExport({ filename, onExport }: { filename: string;
onExport: () => Promise<ActionResult<{ csv: string }>> }): { isPending:
boolean; run: () => void }`, the logic now inside `ExportCsvButton`
  (download, success and error toasts) moved unchanged.

- [ ] **Step 1: Add the test states**

- `cash-book/default` with `stress: true` at phone viewports.
- `more-menu` (phone): open `More` in the header; assert menu items
  `Export CSV` and `Categories`; select Categories; assert the categories
  dialog is open.
- `add-expense`: click Add expense.
- `cancel-expense`: open the first row's actions menu, choose Cancel
  expense.
- `cash-book-days/pinned` (phone): scroll the table container right by
  200px; assert the first body cell's left edge equals the container's.

- [ ] **Step 2: Run** `node run.mjs cash-book` and
      `node run.mjs cash-book-days`. Expected: FAIL on header overflow and the
      missing More menu.

- [ ] **Step 3: Implement**

- Header below `sm`: Add expense stays a button; Export CSV and Categories
  are `max-sm:hidden` and a `More` dropdown (`sm:hidden`, Ellipsis icon,
  labelled `More`) offers both, Export CSV through `useCsvExport`.
- Toolbar and Open spreadsheet row below `sm`: full-width selects,
  the spreadsheet button full width.
- Fix whatever else Step 2 reports.

- [ ] **Step 4: Run** both routes. Expected: PASS, desktop included.

- [ ] **Step 5: Look** at `out/cash-book/**/*-360x640.png`.

- [ ] **Step 6: Typecheck, lint, format, commit**
      (`feat(responsive): cash book on phones`).

---

### Task 9: Expense spreadsheet

**Files:**

- Modify: `.../cash-book/spreadsheet/components/ExpenseSpreadsheetGrid.tsx`
- Modify: `.../cash-book/spreadsheet/components/SpreadsheetPeriodBar.tsx`
- Modify: `.../cash-book/spreadsheet/ExpenseSpreadsheetTab.tsx` (footer)
- Test: `Billing-qa/routes.mjs` (`spreadsheet`)

- [ ] **Step 1: Add the test states**: `pinned` (phone): scroll the grid
      right by 200px; assert the first body row's `#` cell keeps its left edge.
      `footer` (phone): every footer control is inside the viewport.

- [ ] **Step 2: Run** `node run.mjs spreadsheet`. Expected: FAIL on
      `pinned` and on the period bar's `w-52` month select.

- [ ] **Step 3: Implement**: the `#` column (header, body, footer cells) is
      `max-lg:sticky max-lg:left-0` with its own background and edge shadow, as
      `CashBookDaysTable`'s `PINNED` does; period bar and toolbar full width
      below `sm`; the footer wraps with each control 40px.

- [ ] **Step 4: Run** `node run.mjs spreadsheet`. Expected: PASS, desktop
      included.

- [ ] **Step 5: Look, then typecheck, lint, format, commit**
      (`feat(responsive): expense spreadsheet on phones`).

---

### Task 10: Items, and the shared row actions menu

**Files:**

- Create: `src/components/custom/RowActionsMenu.tsx`
- Modify: `src/components/pages/administration/items/ItemsColumns.tsx`,
  `ItemsTab.tsx`
- Modify: `.../items/components/ItemsTableToolbar.tsx`
- Modify: `.../items/create-update-item-dialog/CreateUpdateItemDialog.tsx`,
  `components/StockTrackingSection.tsx`
- Modify: `.../items/update-stock-dialog/UpdateStockDialog.tsx`
- Test: `Billing-qa/routes.mjs` (`items`)

**Interfaces:**

- Produces, for Tasks 11 and 12:

```ts
export type RowAction = {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  disabled?: boolean;
  /** Shown under the label when disabled; desktop shows it as a title. */
  disabledReason?: string;
  destructive?: boolean;
};

export function RowActionsMenu(props: {
  /** The trigger's aria-label, e.g. "Actions for Veg Burger". */
  label: string;
  actions: RowAction[];
  className?: string;
}): React.JSX.Element;
```

A ghost `size="icon"` trigger with the `Ellipsis` icon and a
`DropdownMenu` aligned `end`, as `ExpensesColumns` does. The caller hides it
at its table's fold width (for example `lg:hidden`) and hides the desktop
icon buttons below it (`max-lg:hidden`).

- [ ] **Step 1: Add the test states**

- `items/default` with `stressText` setting the first item name to
  `Paneer Tikka Butter Masala Special Cheese Combo`.
- `row-menu` (phone): assert every row shows a `[role=switch]` and an
  `Actions for …` trigger; open the first tracked item's menu; assert items
  `Update stock`, `Edit`, `Remove`; open an untracked item's menu; assert
  `Update stock` is disabled and the text `Turn on stock tracking in Edit`
  is visible.
- `new-item`: click New item. `update-stock`: open a tracked item's Update
  stock (menu on phone, icon on desktop). `remove`: choose Remove.

- [ ] **Step 2: Run** `node run.mjs items`. Expected: FAIL on `sideScroll`,
      the toolbar and `row-menu`.

- [ ] **Step 3: Implement**

- `RowActionsMenu` per the Interfaces block.
- Items table folds below `lg`: visible thumbnail, Name, Stock, Available
  and the actions menu; Category pill, price and `Order n` move under the
  name. If 360px still scrolls, the thumbnail hides below `sm` and the
  stock badge moves under the name too.
- Toolbar below `sm`: search full width, the two selects side by side
  beneath it, each half the width.
- Item and stock dialogs: `grid-cols-2` rows become `grid gap-4
sm:grid-cols-2`.

- [ ] **Step 4: Run** `node run.mjs items`. Expected: PASS, desktop
      included.

- [ ] **Step 5: Look, then typecheck, lint, format, commit**
      (`feat(responsive): items on phones, shared row actions menu`).

---

### Task 11: Categories

**Files:**

- Modify: `src/components/pages/administration/categories/CategoriesColumns.tsx`,
  `CategoriesTab.tsx`
- Test: `Billing-qa/routes.mjs` (`categories`)

**Interfaces:** Consumes `RowActionsMenu` and `RowAction` from Task 10.

- [ ] **Step 1: Add the test states**: `default` with `stressText` setting
      the first category name to `Fresh Juices Milkshakes and Cold Coffee`;
      `row-menu` (phone): open the first row's menu; assert `Edit` and `Remove`;
      `edit`: choose Edit.

- [ ] **Step 2: Run** `node run.mjs categories`. Expected: FAIL.

- [ ] **Step 3: Implement**: folds below `sm`; sort order and item count
      under the name; Edit and Remove in `RowActionsMenu` below `sm`.

- [ ] **Step 4: Run** `node run.mjs categories`. Expected: PASS, desktop
      included.

- [ ] **Step 5: Look, then typecheck, lint, format, commit**
      (`feat(responsive): categories on phones`).

---

### Task 12: Accounts

**Files:**

- Modify: `src/components/pages/administration/users/UsersColumns.tsx`,
  `UsersTab.tsx`
- Test: `Billing-qa/routes.mjs` (`users`)

**Interfaces:** Consumes `RowActionsMenu` and `RowAction` from Task 10.

- [ ] **Step 1: Add the test states**: `default` with `stressText` setting
      the first name to `Mohammed Abdul Rahman Siddiqui Khan`; `row-menu`
      (phone): open the signed-in owner's row menu; assert `Reset password` is
      enabled and the deactivate action is disabled with a visible reason;
      `create`: click New account; `reset`: choose Reset password on the
      `qa-cashier` row; `deactivate`: choose Deactivate on the `qa-cashier`
      row and stop at the confirm dialog (never confirm it).

- [ ] **Step 2: Run** `node run.mjs users`. Expected: FAIL.

- [ ] **Step 3: Implement**: folds below `lg`; username, role badge and
      bill count under the name; the status badge stays on the right; Reset
      password and Deactivate/Reactivate in `RowActionsMenu` below `lg`, the
      disabled self-deactivate with `disabledReason` `You can't deactivate your
own account`.

- [ ] **Step 4: Run** `node run.mjs users`. Expected: PASS, desktop
      included.

- [ ] **Step 5: Look, then typecheck, lint, format, commit**
      (`feat(responsive): accounts on phones`).

---

### Task 13: Settings

**Files:**

- Modify: only what the checks flag under
  `src/components/pages/administration/settings/`
- Test: `Billing-qa/routes.mjs` (`settings`)

- [ ] **Step 1: Add the test state**: `receipt-preview`: click Preview
      receipt.

- [ ] **Step 2: Run** `node run.mjs settings` and note the failures.

- [ ] **Step 3: Implement** fixes for what Step 2 reported.

- [ ] **Step 4: Run** `node run.mjs settings`. Expected: PASS, desktop
      included.

- [ ] **Step 5: Look** at `out/settings/**/*-360x640.png`. If Step 2 found
      nothing and the screens are right, there is nothing to commit: say so in
      the task report. Otherwise typecheck, lint, format, commit
      (`feat(responsive): settings on phones`).

---

### Task 14: Login and error pages

**Files:**

- Modify: only what the checks flag in `src/components/pages/login/`,
  `src/components/custom/AppErrorScreen.tsx`, `src/app/not-found.tsx`,
  `src/app/global-error.tsx`
- Test: `Billing-qa/routes.mjs` (`login`, `not-found`, `admin-as-cashier`)

- [ ] **Step 1: Add the test state**: `login/short` (viewport 360×340,
      like an open keyboard): focus `#password`; assert the submit button can
      be scrolled into view.

- [ ] **Step 2: Run** the three routes and note the failures.

- [ ] **Step 3: Implement** fixes for what Step 2 reported.

- [ ] **Step 4: Run** the three routes. Expected: PASS, desktop included.

- [ ] **Step 5: Look; commit only if something changed**
      (`feat(responsive): login and error pages on phones`).

---

### Task 15: Receipt page and the phone printer guide

**Files:**

- Create: `src/components/pages/print/components/ReceiptPhoneActions.tsx`
- Modify: `src/components/pages/print/ReceiptView.tsx`
- Modify: `docs/printer-setup.md`
- Test: `Billing-qa/routes.mjs` (`print`)

**Interfaces:**

- Produces `ReceiptPhoneActions(): React.JSX.Element`, a client component:
  `no-print lg:hidden`, two full-width 48px buttons as wide as the
  receipt: **Print** (`Button variant="dark"`, calls `window.print()`) and
  **Back to billing** (`Button variant="outline" asChild` around
  `<Link href="/bill" replace>`). `ReceiptView` renders it, and keeps
  today's text link in its existing div with `max-lg:hidden` added.

- [ ] **Step 1: Add the test states** (phone)

- `print/actions`: assert buttons `Print` and `Back to billing`, each at
  least 48px tall; click Print; assert `window.__printed` went up by 1.
- `print/back-after-print`: from `/bill`, add an item, open the sheet,
  Save & Print; on the receipt click Back to billing; then `page.goBack()`;
  assert the URL does not contain `/print/`.

- [ ] **Step 2: Run** `node run.mjs print`. Expected: FAIL (no buttons).

- [ ] **Step 3: Implement** per the Interfaces block. The receipt and
      `receipt.css` are not touched.

- [ ] **Step 4: Run** `node run.mjs print`. Expected: PASS, desktop
      included (the desktop link is unchanged).

- [ ] **Step 5: Write the guide**

Add `## Printing from a phone` to `docs/printer-setup.md`, from spec §8 and
§7.17: Android (pair over Bluetooth or join the printer's Wi-Fi; install the
printer maker's print service, or a general one such as RawBT; in Chrome's
print preview pick the printer, paper 80mm or 58mm, margins none, headers
and footers off; print a test receipt); iPhone (AirPrint printers only; if
the home-screen app will not print, print from a Safari tab); and the
receipt page's Print button for a print sheet that was closed or never
opened.

- [ ] **Step 6: Typecheck, lint, format, commit**
      (`feat(responsive): receipt print and back buttons on phones, phone printer guide`).

---

### Task 16: Project guide, full verification, hand-off

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

Add the spec to the docs table (`docs/superpowers/specs/2026-10-24-mobile-responsive-design.md`
— "Phones and tablets: what changes below 1024px"). Under the Ember
**Rules**, add: phone and tablet styles only through `max-lg:` /
`max-md:` / `max-sm:` (or a base class restored at `lg:`), nothing changes
at 1024px and up; tables fold low-priority columns into the main cell and
use `RowActionsMenu` below the fold; behaviour gated on the viewport uses
`src/lib/utils/viewport.ts`.

- [ ] **Step 2: Run everything**

Run: `npm run verify:offline`
Expected: every step passes.
Run: `npm run build`
Expected: the build completes.
Run (in `Billing-qa`): `node run.mjs all`
Expected: `PASS` for every route.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: responsive rules in the project guide"
```

- [ ] **Step 4: Hand off the real-phone test**

Stop both dev servers; `git worktree remove ../Billing-baseline`. Ask the
owner before pushing: on a yes, push `feature/mobile-responsive` and open a
draft PR into `test` so Netlify builds a deploy preview. Give the owner the
checklist from spec §9: confirm the preview's `DATABASE_URL` is the
development database and sign-in works on its address; then on an Android
phone and an iPhone, each in a browser tab and installed to the home
screen: a full bill through Save & Print, a reprint from the Bills list, an
expense, an item edit. On the iPhone home-screen app, note whether
`window.print()` opens the print sheet (if not, confirm the guide's Safari
advice matches what happened) and whether the bill bar sits under the home
indicator (if it does, the follow-up is spec §7.17's `viewportFit: "cover"`
fix). Also tell the owner about spec §6.9's note: at exactly 1024px a
six-figure KPI can already be cut off today, left unchanged here, to fix
separately if they want.
