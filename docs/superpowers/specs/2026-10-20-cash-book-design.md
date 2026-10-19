# Cash Book — Design

Date: 2026-10-20 · Status: draft for owner review

Adds a **Cash book** to the POS: one owner-only page that shows the money that
came into the shop (completed bills, which the app already records) beside
the money that went out (expenses the owner types in), each split into
**offline (cash)** and **online (UPI, card, bank transfer)**. The layout is
"Option A" from the brainstorming mockups.

## 1. Intent

The client wants to see, for any day or date range, how much money came in
and how much went out, and how much of each was cash and how much online.
Money in already exists: every completed bill records its payment method.
What is missing is money out. Today the owner pays suppliers, staff, rent and
utilities by cash or online, and none of that is in the system.

This follows the shape that Indian cash book apps (CashBook, Khatabook,
Vyapar) and restaurant POS systems (Petpooja) share:

- every entry is in or out, and every rupee is cash or online
- sales are never typed in twice; they come from the bills
- expenses carry a category, so spend can be broken down
- nothing is silently deleted; a mistake is cancelled with a reason and the
  change is logged

Success means the owner can open one page, pick "This month", and read off
money in, money out and the net, each split into cash and online, without a
paisa of drift. They can also see where the money went by category, and
explain every expense afterwards (who entered it, when, and what changed).

## 2. Goals

1. The owner records an expense: amount, date, category, mode (Cash, or
   Online as UPI / Card / Bank transfer), and optionally who was paid and a
   note.
2. The owner can edit an active expense. Every edit is written to the
   existing Audit log with before and after values.
3. The owner can cancel an expense with a required reason. A cancelled expense
   stays visible, marked as cancelled, and no longer counts toward any total.
   Nothing is ever deleted.
4. The Cash book page shows, for a date range:
   - **Money in** (completed bills), split cash / online
   - **Money out** (active expenses), split cash / online
   - **Net** (in − out), split cash / online
   - the expense list
   - a **Day by day** table
   - **Spend by category**
5. The owner manages the expense categories (add, rename, retire), starting
   from a ready-made list for a fast food shop.
6. The expense list exports to CSV, and expenses join the Settings backup
   export.
7. Cashiers cannot see or change any of this by any path.

## 3. Non-goals

- **Manual money-in entries** (owner adding capital, other income). Money in
  is bills only (client decision).
- **Photos or attachments** on expenses (client decision).
- Cash drawer sessions: opening float, expected vs counted cash, shortage or
  excess, day close, locking a day.
- A **running balance** ("cash in hand: ₹12,400"). That needs opening
  balances and a drawer count. The page shows totals for a range, not a
  balance carried forward.
- Cashiers recording pay-outs from the till.
- A supplier list: supplier phone numbers, credit owed to suppliers (udhaar),
  payables.
- Recurring expenses (rent posted automatically each month), budgets, alerts.
- GST on expenses, input tax credit, profit & loss, cost of goods sold.
- Linking expenses to stock restocks.
- Swiggy / Zomato. They arrive later as their own feature.
- Any change to the Dashboard (Option B was not chosen).

## 4. Anti-goals (a failure even if it "works")

- A JavaScript `number` anywhere in an amount path, or a total that is off by
  a paisa.
- A cashier receiving any expense figure through any path: page, RSC payload,
  server action, CSV, backup, or navigation.
- An expense that disappears with no trace (a hard delete), or that changes
  with no audit row.
- A cancelled expense counted in any total.
- The till, bill creation, receipts, the Sales and What's selling reports, or
  the Dashboard behaving differently. The backup export does grow; see §9.
- Labelling Net as "profit". It is cash flow (money in minus money out), not
  profit. There is no cost-of-goods accounting.

## 5. Decisions

| Question                  | Decision                                                            | By       |
| ------------------------- | ------------------------------------------------------------------- | -------- |
| What counts as money in   | Completed bills only; voided bills excluded, as in every report     | Client   |
| Who records expenses      | **Owner (SUPERADMIN) only**                                         | Client   |
| Photo of the bill         | Not wanted                                                          | Client   |
| Page layout               | Option A: one Cash book page with in, out and net together          | Client   |
| Online modes for expenses | UPI, Card, Bank transfer; all three roll up into "Online"           | Our call |
| Mistakes                  | Edit (audited) while active; cancel with reason; never delete       | Our call |
| Bills paid as "Other"     | Counted in total money in, shown as their own line, not cash/online | Our call |
| Categories                | Seeded list, owner can add, rename, retire                          | Our call |
| Default date range        | This month                                                          | Our call |
| Where the page lives      | `/administration/cash-book`, linked under **Insights** for owner    | Our call |

## 6. Data model

### 6.1 Enum `expense_mode` (new)

`CASH`, `UPI`, `CARD`, `BANK_TRANSFER`.

This is a separate enum from the bills' `payment_method` because the two lists
differ. Bank transfer is not a till option, and "Other" is not wanted for
expenses. The **group** is derived, not stored:

```
CASH → offline
UPI, CARD, BANK_TRANSFER → online
```

That rule lives in one helper (e.g. `src/lib/utils/expense-mode.ts`), used by
queries, UI and CSV alike. Bills use their own mapping in the same module:
`CASH → offline`, `UPI, CARD → online`, `OTHER → other`.

### 6.2 `expense_categories` (new)

| Column       | Type                      | Notes                     |
| ------------ | ------------------------- | ------------------------- |
| `id`         | `uuid` PK                 |                           |
| `name`       | `text` not null           | trimmed, 1–40 chars (Zod) |
| `is_active`  | `boolean` default `true`  | soft delete ("retire")    |
| `created_at` | `timestamptz` default now |                           |
| `updated_at` | `timestamptz` default now |                           |

- Unique index on `lower(name)` **where `is_active`**, the same as menu
  categories, so only live categories must be uniquely named.
- **Seeded by the migration**, not by `db:seed`, so the live shop gets them on
  `db:migrate`: Raw materials, Vegetables & dairy, Gas, Packaging, Salary,
  Rent, Electricity, Repairs & maintenance, Other.
- The picker lists active categories alphabetically. There is no reordering.

### 6.3 `expenses` (new)

| Column            | Type                                   | Notes                                          |
| ----------------- | -------------------------------------- | ---------------------------------------------- |
| `id`              | `uuid` PK                              |                                                |
| `expense_date`    | `date` not null                        | shop-local date chosen by the owner            |
| `amount`          | `numeric(10,2)` not null               | `CHECK (amount > 0)`                           |
| `mode`            | `expense_mode` not null                |                                                |
| `category_id`     | `uuid` → `expense_categories` restrict |                                                |
| `paid_to`         | `text` nullable                        | ≤ 80 chars; empty string stored as NULL        |
| `note`            | `text` nullable                        | ≤ 200 chars; empty string stored as NULL       |
| `cancelled_at`    | `timestamptz` nullable                 |                                                |
| `cancelled_by`    | `uuid` → `users` nullable              |                                                |
| `cancel_reason`   | `text` nullable                        | ≤ 200 chars, required when cancelling          |
| `idempotency_key` | `uuid` not null, unique                | double-submit protection, as bills (spec §8.4) |
| `created_by`      | `uuid` → `users` restrict              |                                                |
| `created_at`      | `timestamptz` default now              |                                                |
| `updated_by`      | `uuid` → `users` nullable              | last editor                                    |
| `updated_at`      | `timestamptz` default now              |                                                |

- `CHECK`: `cancelled_at`, `cancelled_by` and `cancel_reason` are either all
  NULL or all set.
- Indexes: `(expense_date)`, `(category_id)`.
- **Triggers** (hand-written migration, like
  `0004_stock_movements_immutable.sql`; keep `_journal.json` in sync):
  - reject every `DELETE` on `expenses`
  - reject every `UPDATE` where `OLD.cancelled_at IS NOT NULL`: a cancelled
    expense is final
  - reject `DELETE` on `expense_categories` (retire instead)

An "active" expense is one where `cancelled_at IS NULL`. Every money figure
counts active expenses only.

**Category names are read by join, not snapshotted.** This differs on purpose
from `bill_items` (non-negotiable 4). A bill is an immutable sale. An expense
category is the owner's own label, and renaming "Gas" to "Cooking gas" is
meant to relabel past spend. Grouping is by `category_id`, so a retired
category still shows its name on its old expenses.

## 7. Money

All amounts follow the existing rules:

- decimal strings end to end, `numeric(10,2)` in Postgres
- sums done in SQL, returned as `::text` and passed through `toAmount()`
- arithmetic (net, day-by-day) through `money.ts`
- display through `formatINR()`, with `tabular-nums`

The amount crosses the wire as a validated decimal string, the same as bill
amounts; never `z.number()`. The upper bound is whatever fits `numeric(10,2)`.
A tighter sanity cap is the builder's call.

Spend-by-category bar widths may call `Number()`, with the usual
display-geometry comment.

### 7.1 Figures on the page (for the selected range)

| Figure             | Source                                                                         |
| ------------------ | ------------------------------------------------------------------------------ |
| Money in · cash    | sum of `bills.total`, `COMPLETED`, `payment_method = CASH`, by `business_date` |
| Money in · online  | same, `payment_method IN (UPI, CARD)`                                          |
| Money in · other   | same, `payment_method = OTHER`; shown only when non-zero                       |
| Money in · total   | cash + online + other                                                          |
| Money out · cash   | sum of active `expenses.amount`, `mode = CASH`, by `expense_date`              |
| Money out · online | same, `mode IN (UPI, CARD, BANK_TRANSFER)`                                     |
| Money out · total  | cash + online                                                                  |
| Net · cash         | in cash − out cash                                                             |
| Net · online       | in online − out online                                                         |
| Net · total        | in total − out total (so includes "other")                                     |

Net values can be negative and must display as negative (e.g. "−₹2,350.00"),
with a destructive tone.

The KPI figures reflect the **date range only**. Filters on the expense list
(§8.3) never change them.

## 8. The Cash book page

Route `/administration/cash-book` (`ADMIN_ROUTES.cashBook`). The page calls
`requireSuperadmin()` itself (non-negotiable 2), reads `?from=&to=` through
`resolveReportRange(params, timeZone, "THIS_MONTH")`, and renders one
component from `src/components/pages/administration/cash-book/`. The layout
follows the brainstorming mockup (`.superpowers/brainstorm/…/cash-book-layout.html`,
which is local only and not committed) and uses Ember tokens. This section is
the authority wherever the two differ.

**Navigation:** a "Cash book" link in the **Insights** section, after "What's
selling", shown **only to SUPERADMIN**. `navSectionsFor` returns an
owner-specific Insights section; the cashier's list is unchanged. The icon is
the builder's call.

### 8.1 Header and range

`PageHeader`: title "Cash book", description "Money in from bills and money
out from expenses, cash and online.", actions **Export CSV**, **Categories**,
and **+ Add expense** (primary). Below it is the existing `ReportDateRangeBar`
with its presets and custom range.

### 8.2 KPI row

Three `StatCard`s; Net is the one `tone="hero"`. Each card shows its total in
`font-heading`, with a cash / online split line underneath using two dots.
Money in shows an "Other ₹…" line when that figure is non-zero.

The cash and online dot colours are new tokens in `globals.css` (or reuse
`--chart-1`/`--chart-2`), and the same pair is used everywhere on this page.
These dots mean the **group**, not the bill payment method, so they do not use
`PAYMENT_METHOD_DOT`.

### 8.3 Left card: tabs "Expenses" | "Day by day"

**Expenses tab.** A table in `TableCard`:

- **Columns:** Date, Category with "paid to · note" underneath, Mode (pill:
  Cash, or UPI / Card / Bank transfer in the online tone), Amount, and a row
  menu (Edit, Cancel).
- **Sorting:** `expense_date` desc, then `created_at` desc.
- **Cancelled rows:** shown in place, muted, amount struck through, with a
  "Cancelled" badge and the reason. Their menu has no actions.
- **"Edited" marker:** a small marker on rows whose `updated_at` is later than
  `created_at`.
- **Filters:** Mode (All / Cash / Online) and Category. They filter the list
  only.
- **Empty state:** `TableEmptyState`, "No expenses in this range", with an Add
  expense button.
- Pagination or a row cap: the builder's call. A month is expected to hold
  around 100–300 expenses.

**Day by day tab.** One row per date in the range that has any bill or
expense. Columns: Date, In cash, In online, Out cash, Out online, Net, and a
totals row. "Other" bill money is included in Net but gets no column of its
own. The builder may add a column if it reads better on screen.

### 8.4 Right card: Spend by category

Active expenses in the range, grouped by category, sorted by amount desc,
hiding zero rows. Each row has the name, the amount, and a share bar in
`bg-brand`. On a phone it stacks below the left card.

### 8.5 Add / Edit expense dialog

As in the mockup, amount first:

| Field    | Rule                                                                                    |
| -------- | --------------------------------------------------------------------------------------- |
| Amount   | `MoneyInput`, required, > 0                                                             |
| Paid by  | Cash / Online toggle; Online reveals UPI / Card / Bank transfer, default UPI            |
| Category | active categories, required                                                             |
| Date     | defaults to the shop's today; past allowed; **future rejected** (server, shop timezone) |
| Paid to  | optional, ≤ 80; suggestions from earlier `paid_to` values are the builder's call        |
| Note     | optional, ≤ 200                                                                         |

- **Create** sends `{ idempotencyKey, expenseDate, amount, mode, categoryId,
paidTo, note }`. The key is generated when the dialog opens. A retry with
  the same key returns the original expense rather than a second one.
- **Edit** opens the same dialog prefilled. Every field can change. The
  category picker also shows the expense's current category even if it has
  since been retired, but cannot switch to a different retired one.
- Touch targets are at least 40px, matching the till rule.

### 8.6 Cancel

A `ConfirmDialog` with a required reason ("Entered twice", "Wrong amount"),
which cannot be undone. The copy says so, and suggests adding a fresh expense
if the amount was wrong.

### 8.7 Categories

The **Categories** button opens a dialog listing active expense categories,
with Add, Rename and Retire. Rules:

- Names are unique, case-insensitive, among active categories.
- Retiring is allowed even if expenses use the category: they keep it, and it
  leaves the picker.
- **The last active category cannot be retired**, otherwise no expense could
  be added.

A full table page like menu Categories is not needed.

### 8.8 Export CSV

The CSV has the expense list for the range, including cancelled rows. Columns:
date, category, paid to, note, mode, group (Cash/Online), amount, status,
cancel reason, entered by, entered at. Use the existing `toCsv` and
`csvAmount`.

## 9. Server side

`src/server/expenses/`:

- **`expenses-actions.ts`:** thin. Each action calls `requireSuperadmin()`,
  validates with Zod, delegates, and returns an `ActionResult`.
  - `createExpenseAction`
  - `updateExpenseAction`
  - `cancelExpenseAction`
  - `createExpenseCategoryAction`
  - `updateExpenseCategoryAction`
  - `retireExpenseCategoryAction`
  - `exportExpensesCsvAction`
- **`expenses-service.ts`:** the logic and checks. Validation that can fail
  runs before any write (non-negotiable 6):
  - category exists and is active
  - date is not in the future
  - expense is still active before editing or cancelling

  Each write is a single statement, so no transaction is needed:
  - a create is one insert, protected by the unique `idempotency_key` (on a
    conflict, return the existing row)
  - an edit or cancel is one `UPDATE … WHERE id = $1 AND cancelled_at IS
NULL`; zero rows affected means `CONFLICT`
  - concurrent edits are last-write-wins, and each edit is audited

- **`expenses-queries.ts`:** reads. Called only from the guarded page and
  actions:
  - `getCashBookSummary(from, to)`
  - `getCashBookByDay(from, to)`
  - `getSpendByCategory(from, to)`
  - `listExpenses(from, to)`
  - `listExpenseCategories()`
  - all wrapped in `withConnectionRetry`
- **Validation:** `src/lib/validation/expense-schema.ts`. Types go in
  `src/types/expense.types.ts`.
- **Audit:** new actions in `AUDIT_ACTIONS` and `AUDIT_ACTION_LABELS`:
  - `EXPENSE_CREATED`, `EXPENSE_UPDATED` (before/after), `EXPENSE_CANCELLED`
    (with reason)
  - `EXPENSE_CATEGORY_CREATED`, `EXPENSE_CATEGORY_UPDATED`,
    `EXPENSE_CATEGORY_RETIRED`
  - money in before/after stays a string
- **Backup:** `exportAllDataAction` gains `expenses` (and its categories, by
  name) in the `ExportBundle`, so the monthly safety net covers it. Update the
  Settings backup UI and any docs that list the bundle's files.
- **Revalidate:** `ADMIN_ROUTES.cashBook` after every write.

## 10. Edge cases

- **Backdated expense:** an expense dated last week changes last week's
  figures. This is expected and visible through the "Edited" and audit trail.
- **Shop timezone:** "today" and "future" use `getShopTimezone()` and
  `businessDate()`, so an entry at 00:30 IST is dated correctly.
- **Double tap on Save:** the idempotency key returns the first expense.
- **Category retired while the dialog was open:** the server rejects it with a
  clear field error. Nothing is saved.
- **Edit or cancel of an expense that was cancelled in another tab:** the
  server refuses it (`CONFLICT`), and the trigger is the backstop.
- **Range with no bills and no expenses:** KPIs show ₹0.00, and both tabs show
  empty states.
- **Negative net:** shown with a minus sign and a destructive tone, never as a
  bare number.
- **Large custom ranges:** Day by day lists only days with activity, so it
  never builds a full calendar and isn't bound by the 1000-day guard in
  `eachDateInRange`.
- **Phone width:** KPIs stack, the cards stack, tables follow the existing
  `TableCard` behaviour, and there is no horizontal page scroll.

## 11. What does not change

- Bills, bill creation, numbering, receipts and printing.
- The till.
- The Sales report, What's selling, the Bills ledger and the Dashboard, for
  both roles.
- Menu categories, items, stock.
- The cashier's navigation.

## 12. Verification

No test framework (client decision). Add:

- **`verify:cash-book-utils`** (offline, added to `verify:offline`):
  - mode → group mapping for expenses and bills
  - summary and net maths, including negative net and a non-zero "other"
  - the float-trap values (`60.50 + 40.30 − 10`)
  - day-by-day merging of bill days and expense days
- **`verify:expenses`** (database, added to `verify:all`):
  - every action refuses a cashier session
  - CHECKs reject amount ≤ 0 and a half-filled cancellation
  - triggers reject DELETE and any UPDATE of a cancelled expense, and reject
    DELETE on categories
  - idempotency returns the first row
  - a cancelled expense drops out of every total
  - a future date is rejected
  - the last category cannot be retired
  - summary figures match a known fixture to the paisa
- `npm run verify:all` and `npm run build` pass.
- **Look at the screen:** run the dev server and check the page at desktop and
  phone widths, as owner and as cashier. As cashier, check that the nav has no
  link, the page shows "Not allowed", and **the response body contains no
  expense data** (the parallel-render leak from non-negotiable 2).

Update `CLAUDE.md`'s doc table with this spec and the verify table with the
two new checks.

## 13. Left to the builder

- File and component names inside the feature folder, following the
  conventions (`CashBookTab.tsx`, `ExpensesColumns.tsx`,
  `hooks/useCashBookTab.ts`, …).
- The nav icon, and whether the cash/online dots get new tokens or reuse chart
  tokens.
- Pagination versus a row cap on the expense list.
- A sanity cap on a single expense amount.
- "Paid to" suggestions.
- Whether Day by day gets an "Other in" column.
