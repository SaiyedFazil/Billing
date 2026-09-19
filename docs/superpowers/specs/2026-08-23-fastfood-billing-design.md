# Fast Food Billing Web App — Design Spec

**Date:** 2026-08-23
**Status:** Approved for implementation planning
**Client:** Single-outlet fast food shop

---

## 1. Context

A fast food shop needs a counter billing system. Staff ring up walk-in
customers, print a thermal receipt, and hand it over. The owner needs every
sale recorded in a form that survives an audit, plus statistics on what is
selling.

The system is used by two kinds of people:

- **Admin** — the person at the counter. Creates bills, reprints them, views
  sales statistics.
- **Superadmin** — the owner. Everything an admin can do, plus managing the
  menu, prices, user accounts, shop settings, and the audit log.

Scale is small: one outlet, one or two tills, on the order of 100–300 bills a
day. The system runs entirely on free hosting tiers until the client chooses to
pay for upgrades.

---

## 2. Goals

1. Ring up a bill and print an 80mm thermal receipt in seconds.
2. Store every sale immutably, with enough detail to reconstruct any day's
   trading from the database alone.
3. Report on sales and item performance over any date range, exportable to CSV.
4. Separate menu/user administration (superadmin) from daily billing (admin).
5. Run on free tiers with a clean, code-free upgrade path to paid plans.

## 3. Non-goals (v1)

Explicitly out of scope, recorded here so scope creep stays visible:

- Tax / GST invoicing (no GSTIN, HSN codes, or CGST/SGST split)
- Inventory and stock tracking
- Bill void / refund **user interface** (the schema supports it; the UI is v2)
- Customer records and repeat-customer history
- Offline mode / PWA / sync queue
- Table or dine-in running orders, KOT
- Kitchen display system
- Multi-outlet support
- Payment gateway integration (payment method is recorded, not processed)

---

## 4. Decisions

### 4.1 Architecture: Next.js-native monolith

React Server Components for reads, Server Actions for writes, no separate REST
API layer.

**Rejected alternatives:**

- *Explicit REST API layer* — adds roughly 30–40% more code (DTOs, fetch
  wrappers, duplicated validation, manual loading state) to buy flexibility for
  a mobile app that is not planned. YAGNI.
- *Supabase as backend* — auth, DB, storage and RLS in one vendor is genuinely
  attractive, but RLS policy complexity is overkill for two roles, Neon was
  already chosen for Postgres, and it is the heaviest lock-in of the three
  options.

### 4.2 Stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js 15, App Router | RSC + Server Actions remove the API layer |
| Language | TypeScript, `strict` | |
| Styling | Tailwind CSS | |
| Components | shadcn/ui | Owned source, no runtime dependency, easy to restyle |
| ORM | Drizzle | Thin SQL-first layer; Prisma's query engine adds meaningful cold-start weight on serverless functions |
| Database | Neon Postgres (free) | |
| DB driver | `@neondatabase/serverless` **Pool (WebSocket)** via `drizzle-orm/neon-serverless` | Interactive transactions — see §4.3 |
| Auth | Auth.js v5, credentials provider, JWT sessions | No per-user cost, no vendor, 2–10 users |
| Validation | Zod | One schema shared by client form and server action |
| Charts | Recharts (via shadcn chart) | |
| Image storage | ImageKit (free: 5 GB storage, 20 GB bandwidth, no credit card) | On-the-fly resize/WebP conversion |
| Hosting | Netlify Starter (free) | Commercial use permitted, unlike Vercel Hobby |

**No test framework.** Client decision — the app will be verified manually. The
money helpers in `lib/utils/money.ts` are kept deliberately small and obvious to
compensate (§11.3).

### 4.3 Neon WebSocket driver, not HTTP

Creating a bill is three statements that must be atomic: reserve the next bill
number, insert the bill, insert the line items. Step 2 depends on step 1's
returned value.

Neon's HTTP driver issues each query as a separate HTTPS request on a separate
connection, so `BEGIN` in one request means nothing to the next. A failure at
step 3 would leave a bill saved with a total and **zero line items**, and the
day's counter already incremented — a corrupt sales record and a gap in the
bill sequence.

Neon's HTTP driver does offer a batch form, `db.transaction([q1, q2, q3])`, but
every query must be known upfront and none may use another's result. That does
not fit this operation.

The WebSocket Pool driver holds a real Postgres session, so `BEGIN` / `COMMIT` /
`ROLLBACK` behave normally. This is a server-to-database transport detail only:
no WebSocket is exposed to the browser, and no realtime feature exists in the
app.

### 4.4 Hosting: Netlify free, not Vercel free

Vercel's Hobby plan prohibits commercial use, and this is paid client work.
Netlify's Starter plan permits it. Next.js App Router and Server Actions are
supported on Netlify via `@netlify/plugin-nextjs`.

Upgrade path when the client is ready to pay — **environment variables only, no
code changes**: Netlify Pro or Vercel Pro for hosting, Neon Launch for the
database (removing autosuspend and extending the restore window), ImageKit paid
for storage.

### 4.5 Image storage behind an adapter

All uploads and deletes go through one module, `lib/storage/`, exposing
`upload()` and `delete()`. Switching ImageKit for Cloudflare R2 or S3 later
touches one file.

Note for context: the realistic storage need is 30–50 MB (a few hundred item
photos plus a logo). The 5 GB free tier is chosen for convenience, not capacity.

---

## 5. System architecture

```
┌─────────────────────────────────────────────┐
│  Browser: till PC · tablet · phone          │
└──────────────────┬──────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────┐
│  Netlify — Next.js 15 App Router            │
│                                             │
│  RSC pages ..................... reads      │
│  Server Actions ................ writes     │
│  middleware .................... role guard │
│  /print/[billId] ............... 80mm view  │
└────────┬──────────────────────────┬─────────┘
         │ WebSocket pool           │ signed direct upload
┌────────▼──────────┐    ┌──────────▼─────────┐
│  Neon Postgres    │    │  ImageKit CDN      │
└───────────────────┘    └────────────────────┘
```

---

## 6. Data model

Three principles govern the schema, and all three are enforced at the database
level rather than trusted to application code.

### Principle 1 — Money is exact decimals, in rupees

Every monetary amount is stored as `numeric(10,2)` — Postgres's exact decimal
type. `₹60.50` is stored, and reads back, as `60.50`. In TypeScript it is a
decimal **string**, and all arithmetic goes through `src/lib/utils/money.ts`,
which uses big.js.

**Floating point is never used for money anywhere in the system.** This is not
a stylistic preference. `60.50 + 40.30 - 10` evaluates to `110.78999999999999`
in IEEE-754, which fails the `bills_total_matches` CHECK constraint below — the
database rejects the bill and the cashier cannot save the sale. Separately,
`₹1.005` rounds to `1.00` rather than `1.01` under float, so the shop loses a
paisa on every percentage discount.

An earlier revision of this spec stored integer paise, which is also exact. It
was changed to `numeric` so the database reads in rupees, at the client's
request; both are correct, and float is not.

### Principle 2 — Sold lines are snapshots, not references

`bill_items` copies the item name, category name and unit price at the moment
of sale. Renaming an item or changing its price never alters historical bills.
All reporting reads these snapshot columns and never joins to `items` for name
or price.

### Principle 3 — The database refuses to rewrite history

Triggers reject any `UPDATE` or `DELETE` on `bill_items`, and any `DELETE` on
`bills`. `bills` accepts an `UPDATE` only when the changed columns are the void
columns. A bug in application code cannot destroy a sales record.

### 6.1 Enums

```
user_role       : 'ADMIN' | 'SUPERADMIN'
payment_method  : 'CASH' | 'UPI' | 'CARD' | 'OTHER'
bill_status     : 'COMPLETED' | 'VOID'
printer_width   : 'MM_80' | 'MM_58'
```

### 6.2 `users`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | `gen_random_uuid()` |
| username | text NOT NULL | unique index on `lower(username)` |
| password_hash | text NOT NULL | bcrypt, cost 12 |
| name | text NOT NULL | shown on receipts |
| role | user_role NOT NULL | |
| is_active | boolean NOT NULL default true | deactivate, never delete |
| failed_attempts | integer NOT NULL default 0 | login lockout |
| locked_until | timestamptz NULL | |
| created_by | uuid NULL → users.id | |
| created_at / updated_at | timestamptz NOT NULL | |

### 6.3 `categories`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | unique index on `lower(name)` where `is_active` |
| sort_order | integer NOT NULL default 0 | billing screen order |
| is_active | boolean NOT NULL default true | soft delete |
| created_at / updated_at | timestamptz NOT NULL | |

### 6.4 `items`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| category_id | uuid NOT NULL → categories.id ON DELETE RESTRICT | |
| name | text NOT NULL | unique index on `(category_id, lower(name))` where `is_active` |
| price | numeric(10,2) NOT NULL | `CHECK (price >= 0)` |
| image_url | text NULL | ImageKit URL |
| image_file_id | text NULL | ImageKit fileId, needed to delete |
| is_active | boolean NOT NULL default true | retired / soft-deleted |
| is_available | boolean NOT NULL default true | temporarily sold out |
| sort_order | integer NOT NULL default 0 | |
| created_by | uuid NULL → users.id | |
| created_at / updated_at | timestamptz NOT NULL | |

Index: `(category_id)` where `is_active`.

### 6.5 `bills`

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| bill_number | integer NOT NULL | daily sequence, gapless |
| business_date | date NOT NULL | shop-local date, stored not computed |
| subtotal | numeric(10,2) NOT NULL | `CHECK >= 0` |
| discount | numeric(10,2) NOT NULL default 0.00 | flat rupee amount, not a percentage |
| total | numeric(10,2) NOT NULL | |
| payment_method | payment_method NOT NULL | |
| tendered | numeric(10,2) NULL | cash only |
| change_due | numeric(10,2) NULL | cash only |
| status | bill_status NOT NULL default 'COMPLETED' | |
| voided_at | timestamptz NULL | v2 UI |
| voided_by | uuid NULL → users.id | v2 UI |
| void_reason | text NULL | v2 UI |
| idempotency_key | uuid NOT NULL UNIQUE | double-submit protection |
| created_by | uuid NOT NULL → users.id ON DELETE RESTRICT | |
| created_at | timestamptz NOT NULL default now() | |

Constraints:

- `UNIQUE (business_date, bill_number)`
- `CHECK (discount <= subtotal)`
- `CHECK (total = subtotal - discount)`
- `CHECK (tendered IS NULL OR change_due = tendered - total)`

Indexes: `(business_date DESC)`, `(created_at DESC)`, `(created_by)`,
`(payment_method)`.

### 6.6 `bill_items` — immutable snapshot

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| bill_id | uuid NOT NULL → bills.id ON DELETE RESTRICT | never cascade |
| item_id | uuid NOT NULL → items.id ON DELETE RESTRICT | link for analytics only |
| item_name | text NOT NULL | **snapshot** |
| category_name | text NOT NULL | **snapshot** |
| unit_price | numeric(10,2) NOT NULL | **snapshot** |
| quantity | integer NOT NULL | `CHECK (quantity > 0)` |
| line_total | numeric(10,2) NOT NULL | `CHECK (line_total = unit_price * quantity)` |
| created_at | timestamptz NOT NULL | |

Indexes: `(bill_id)`, `(item_id)`.

### 6.7 `bill_counters` — gapless numbering

| Column | Type |
|---|---|
| business_date | date PK |
| last_number | integer NOT NULL default 0 |

Incremented inside the same transaction as the bill insert:

```sql
INSERT INTO bill_counters (business_date, last_number)
VALUES ($1, 1)
ON CONFLICT (business_date)
DO UPDATE SET last_number = bill_counters.last_number + 1
RETURNING last_number;
```

Because the increment and the bill insert share a transaction, a failure rolls
both back — the sequence is genuinely gapless. A plain Postgres sequence would
leave a hole on every failed attempt, and holes in a bill sequence are exactly
what an auditor questions.

**Concurrency:** the `ON CONFLICT DO UPDATE` takes a row lock on that date's
counter, so two tills saving simultaneously serialize on it — the second waits
for the first to commit, then gets the next number. This is the correct
trade-off here: contention is nil at one or two tills, and gaplessness is worth
more than parallelism.

### 6.8 `audit_log`

| Column | Type |
|---|---|
| id | uuid PK |
| actor_id | uuid NULL → users.id |
| action | text NOT NULL |
| entity_type | text NOT NULL |
| entity_id | uuid NULL |
| before | jsonb NULL |
| after | jsonb NULL |
| ip | text NULL |
| user_agent | text NULL |
| created_at | timestamptz NOT NULL default now() |

Logged actions: `ITEM_CREATED`, `ITEM_UPDATED`, `ITEM_PRICE_CHANGED`,
`ITEM_DELETED`, `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_DELETED`,
`USER_CREATED`, `USER_UPDATED`, `USER_DEACTIVATED`, `USER_PASSWORD_RESET`,
`SETTINGS_UPDATED`, `BILL_REPRINTED`, `BILL_VOIDED`, `LOGIN_FAILED`,
`LOGIN_LOCKED`.

Indexes: `(created_at DESC)`, `(actor_id)`, `(entity_type, entity_id)`.

`ITEM_PRICE_CHANGED` is recorded as its own action so price history is directly
queryable without a separate table.

### 6.9 `shop_settings` — singleton row

| Column | Type | Notes |
|---|---|---|
| id | boolean PK default true | `CHECK (id)` — enforces a single row |
| shop_name | text NOT NULL | |
| address_line | text NULL | |
| phone | text NULL | |
| logo_url / logo_file_id | text NULL | |
| receipt_footer | text NULL | e.g. "Thank you! Visit again" |
| printer_width | printer_width NOT NULL default 'MM_80' | |
| currency_code | text NOT NULL default 'INR' | |
| timezone | text NOT NULL default 'Asia/Kolkata' | |
| updated_by | uuid NULL → users.id | |
| updated_at | timestamptz NOT NULL | |

### 6.10 Immutability triggers

| Trigger | Table | Behaviour |
|---|---|---|
| `prevent_bill_item_mutation` | `bill_items` | `BEFORE UPDATE OR DELETE` → `RAISE EXCEPTION` |
| `prevent_bill_delete` | `bills` | `BEFORE DELETE` → `RAISE EXCEPTION` |
| `restrict_bill_update` | `bills` | `BEFORE UPDATE` → allow only when the changed columns are `status`, `voided_at`, `voided_by`, `void_reason`; otherwise `RAISE EXCEPTION` |

M1 acceptance includes manually confirming each trigger actually rejects the
operation it is supposed to reject.

### 6.11 Time and dates

Timestamps are `timestamptz`, stored in UTC. Every bill additionally stores
`business_date`, the shop-local date at the moment of sale. It is computed **in
`createBill`**, in application code, from `shop_settings.timezone` (default
`Asia/Kolkata`), and passed explicitly into the insert — not derived by a
database default, so the value is deterministic and reviewable.

Storing it rather than computing it makes the day boundary unambiguous at
midnight and makes daily reporting an indexed lookup instead of a per-row
timezone conversion.

---

## 7. Authentication and authorization

Auth.js v5, credentials provider, bcrypt cost 12, JWT session strategy with an
8-hour expiry (one shift). No session table is required.

**There is no public signup route.** The first superadmin is created by
`db/seed.ts` from environment variables. Every subsequent account is created by
a superadmin.

### 7.1 Role matrix

| Capability | Admin | Superadmin |
|---|:--:|:--:|
| Create bills | ✓ | ✓ |
| Reprint a bill | ✓ | ✓ |
| Dashboard, sales report, item report, bills ledger | ✓ | ✓ |
| CSV export of reports | ✓ | ✓ |
| Add / edit / delete items and categories | — | ✓ |
| Change prices | — | ✓ |
| Toggle item availability ("sold out") | — | ✓ |
| Manage users, reset passwords | — | ✓ |
| Shop settings and receipt footer | — | ✓ |
| View audit log | — | ✓ |
| Export all data | — | ✓ |

### 7.2 Enforcement

`middleware.ts` redirects unauthenticated requests. **This is a redirect
convenience, not access control.** Server Actions are publicly callable
endpoints; anyone who learns an action ID can invoke it directly regardless of
middleware.

**A layout guard does not cover its pages.** Next.js renders layouts and pages
in parallel, so a page relying on its layout's `requireSuperadmin()` still runs
its queries and streams the results into the RSC payload before the layout's
error propagates — the browser shows "Not allowed" while the response body
carries the data. Verified in testing against `/administration/items`.

Therefore every server action and every protected page begins with a
server-side guard, regardless of what its layout does:

```ts
// lib/auth/guard.ts
requireUser()        // any active account, else UNAUTHORIZED
requireSuperadmin()  // else FORBIDDEN
```

Deactivated users are rejected by the guard even if they hold a valid JWT.

### 7.3 Login hardening

Failed attempts are counted on the `users` row. Five consecutive failures lock
the account for five minutes via `locked_until`. No Redis or third-party
service is required. `LOGIN_FAILED` and `LOGIN_LOCKED` are written to
`audit_log`.

Minimum password length is 8 characters. There is no email-based password
reset; a superadmin resets passwords directly, which is the correct model for a
shop.

---

## 8. Billing screen (`/bill`)

```
┌──────────────────────────────────────────────────────────┐
│ SHOP NAME              Bill #47 · 23 Aug   Cashier: Ravi │
├───────────────────────────────┬──────────────────────────┤
│ [All][Burgers][Drinks][Sides] │  CURRENT BILL            │
│                               │                          │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │  Veg Burger              │
│ │IMG │ │IMG │ │IMG │ │IMG │   │  ₹60 × 2     [−][+]  120 │
│ │Veg │ │Chkn│ │Coke│ │Frie│   │                          │
│ │₹60 │ │₹110│ │₹30 │ │₹40 │   │  Coke                    │
│ └────┘ └────┘ └────┘ └────┘   │  ₹30 × 1     [−][+]   30 │
│                               │  ──────────────────────  │
│  [ 🔍 Search items…       ]   │  Subtotal           150  │
│                               │  Discount ₹ [   10   ]   │
│                               │  ──────────────────────  │
│                               │  TOTAL              140  │
│                               │  [CASH] [UPI] [CARD]     │
│                               │  Tendered [  200  ]      │
│                               │  Change              60  │
│                               │  [   SAVE & PRINT   ]    │
└───────────────────────────────┴──────────────────────────┘
```

### 8.1 Cart behaviour

The cart is **client state only** (`useReducer`). Nothing is written to the
database until Save & Print. There are no draft rows, no abandoned-cart
cleanup, and no locking.

The active menu (items, categories, prices, image URLs) is delivered once as an
RSC payload on page load. Tapping an item card adds one; tapping again
increments. Quantity steppers and a remove control are on each cart line.

The search box is focused on load and is keyboard-first: typing a fragment
filters the grid, `Enter` adds the top match, `Esc` clears. A busy cashier is
faster on a keyboard than on a touchscreen, and both work.

Discount is a **flat rupee amount**, not a percentage.

### 8.2 Saving a bill — `server/bills/create-bill-service.ts`

The client sends `{ idempotencyKey, lines: [{ itemId, quantity }],
discount, paymentMethod, tendered, expectedTotal }`. Every amount is a decimal string.

**The client never sends prices.** The server re-reads current prices from the
database and computes the totals itself. If the browser supplied prices, a
tampered request could bill ₹1 for a ₹200 item.

Sequence, all within one transaction:

1. Guard: `requireUser()`.
2. Validate the payload with Zod.
3. Look up the idempotency key. If a bill already exists for it, return that
   bill and stop.
4. Load the referenced items; if any is missing, inactive or unavailable,
   abort with `CONFLICT` naming the offending item so the cashier can remove
   it from the cart.
5. Compute `subtotal`, clamp-validate `0 ≤ discount ≤ subtotal`, compute
   `total`.
6. If `total ≠ expectedTotal`, abort and return `PRICE_CHANGED` with the
   new total.
7. Reserve the next `bill_number` for today's `business_date` (§6.7).
8. Insert `bills`.
9. Insert `bill_items` with name, category name and unit price snapshots.
10. Commit; return the bill id and number.

### 8.3 Price-change race

If a superadmin edits a price while a cart is open, step 6 catches it. The UI
shows the recalculated total and asks the cashier to confirm before charging,
rather than silently charging an amount that differs from the screen.

### 8.4 Double-submit protection

Every cart carries a client-generated `idempotency_key`, stored `UNIQUE` on
`bills`. A double-tap, or a client retry after a timeout, returns the existing
bill instead of creating a duplicate. See §11.2 for why this is the most
important error-handling decision in the app.

### 8.5 After saving

The app navigates to `/print/[billId]`, which auto-prints, then returns to a
cleared billing screen ready for the next customer.

---

## 9. Printing (`/print/[billId]`)

A dedicated route with no application shell — plain HTML, monospace font, and a
print stylesheet:

```css
@page { size: 80mm auto; margin: 0; }
@media print {
  body { width: 72mm; font-size: 12px; }
  .no-print { display: none; }
}
```

```
        SHOP NAME
    123 Main Road, City
      Ph: 98765 43210
  ──────────────────────
  Bill #47      23/08/26
  Cashier: Ravi    19:42
  ──────────────────────
  ITEM         QTY   AMT
  ──────────────────────
  Veg Burger     2   120
  Coke           1    30
  ──────────────────────
  Subtotal           150
  Discount           -10
  TOTAL             ₹140
  Paid: CASH         200
  Change              60
  ──────────────────────
   Thank you! Visit again
```

**No ESC/POS, no native print bridge, no drivers to write.** Any thermal
printer with a Windows driver appears as a normal system printer and the
browser prints to it.

A monospace font is used so columns align the way a real receipt does. Photos
are not printed — thermal printers dither them badly. An optional logo must be
small and high-contrast.

`window.print()` fires automatically on load from a small client component.

`printer_width` in settings switches the layout between 80mm and 58mm, so
replacing the printer is a dropdown change rather than a code change.

**One-time setup at install** (documented in `docs/printer-setup.md` for
handover): set the thermal printer as the system default; in Chrome, disable
headers and footers and set margins to none.

**Reprints are logged.** Any bill can be reopened from the ledger and
reprinted, and every reprint writes `BILL_REPRINTED` to `audit_log`. Without
this, "reprint" becomes an untraceable way to issue duplicate receipts.

---

## 10. Reports

| Route | Content |
|---|---|
| `/` **Dashboard** | Today's total sales, bill count, average bill value, top-selling item. 7-day sales bar chart. |
| `/reports/sales` | Date range → per-day gross, discount, net, bill count. Payment-method breakdown. CSV export. |
| `/reports/items` | Date range → item, category, quantity sold, revenue, share of total. Sorted by revenue descending. CSV export. |
| `/bills` | Every bill, filterable by date range, cashier, payment method and bill number. Click through to detail. |
| `/bills/[id]` | Full bill with all lines, cashier, timestamp, and a reprint action. The auditor's view. |
| `/manage/audit` | Superadmin only. Actor, action, entity, before → after, timestamp. Filterable. |

All report queries read `bill_items` **snapshot** columns and never join to
`items` for name or price. Aggregation is done in SQL with `GROUP BY`, not in
JavaScript.

CSV export is a server action that generates the CSV string and returns it as a
download. No library is required.

**Scale note:** at 200 bills/day, one year is roughly 73,000 bills and 250,000
line items — trivial for Postgres given the indexes in §6. No pre-aggregated
summary tables; that would be premature optimisation.

---

## 11. Error handling

### 11.1 Validation and result shape

Zod schemas in `src/lib/validation/` are the single source of truth, imported by
both the form (`react-hook-form` + `zodResolver`) and the server action. Client
validation is UX; the server re-validates the same schema because that is the
only check that counts.

Server actions never throw at the browser. Every action returns:

```ts
type ActionResult<T> =
  | { ok: true;  data: T }
  | { ok: false; error: { code: ErrorCode; message: string; fields?: Record<string,string> } }

type ErrorCode =
  | 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION' | 'NOT_FOUND'
  | 'CONFLICT' | 'PRICE_CHANGED' | 'DB_UNAVAILABLE' | 'UNKNOWN'
```

Database errors, stack traces and connection strings never reach the client.
They are logged server-side with a correlation ID; the user sees a plain
message plus that ID, so a support call gives something to search for.

Route-level `error.tsx` boundaries per segment plus `global-error.tsx` ensure a
crash in reports cannot take down the billing screen.

### 11.2 "Did my bill save?"

The most damaging failure in a shop: the cashier taps Save, the request hangs,
an error appears, and the food is already handed over. Without a fix they
either re-bill the customer or lose the sale from the books.

The idempotency key resolves this completely. The button reads **Retry**, and
retrying is guaranteed not to duplicate — the same key returns the same bill
whether or not the first attempt committed.

### 11.3 Money helpers

`src/lib/utils/money.ts` is the only place money arithmetic happens. Every
amount in and out is a decimal string in rupees; big.js does the maths.

```ts
parseRupees(input: string): string        // validates and normalises to "60.50"
parseRupeesOrZero(input: string): string  // blank or junk -> "0.00", for live UI
toAmount(value: string | number): string  // normalises what the driver returned
formatINR(rupees: string): string         // "₹60.50", for the screen
formatReceiptAmount(rupees: string): string // "60.50", for the receipt column
add / subtract / multiply / compare / isZero / isNegative
lineTotal(unitPrice: string, quantity: number): string
billTotal(lines, discount: string): { subtotal: string; discount: string; total: string }
```

Two rules that are easy to break by accident:

- **Never compare amounts with `<`, `>` or `===`.** Use `compare()`. `"60.5"`
  and `"60.50"` are the same amount but different strings, and relational
  operators on strings silently coerce to float.
- **Money crosses the wire as a string.** A JSON number is an IEEE-754 double,
  so serialising a total as a number reintroduces the exact bug this design
  avoids. `bill-schema.ts` validates amounts with a regex, not `z.number()`.

Since there is no test framework, `npm run verify:money` covers these functions
with 50 assertions, including the specific values that fail under float.

### 11.4 Free-tier realities

**Neon autosuspends when idle.** The first bill of the morning may hit a cold
database: 1–2 seconds, occasionally a connection error on the first attempt.
The db wrapper retries **once** with backoff, and **only for connection-class
failures raised before any statement executed**. A failed transaction is never
blindly retried. Loading states are explicit so the UI never appears frozen.

**Connection loss.** The app is online-only by decision, but `navigator.onLine`
plus a hard failure banner — *"Offline — this bill has NOT been saved"* —
prevents the worst outcome, which is a cashier believing a bill saved when it
did not.

Success and failure are surfaced with `sonner` toasts; a successful save shows
the bill number.

---

## 12. Item, user and settings management

All routes under `/manage/*` are superadmin-only, enforced by
`requireSuperadmin()` in every action and page.

### 12.1 Items and categories

Searchable table with category filter and an active/inactive toggle. Create and
edit in a shadcn `Dialog`: name, category, price in rupees, image, sort order,
availability toggle.

Delete performs a **soft delete** (`is_active = false`) behind a confirmation
that states plainly: *past bills keep this item; it disappears from the billing
screen.* A hard delete would either orphan sales history or cascade it away.

Every create, update and delete writes to `audit_log` with before/after JSON.
Price changes are recorded as `ITEM_PRICE_CHANGED` specifically.

### 12.2 Image upload flow

```
1. Browser validates the file (jpg/png/webp, ≤ 5 MB)
2. Server action requests a short-lived signed upload token from ImageKit
3. Browser uploads DIRECT to ImageKit — never through the Netlify function
4. ImageKit returns { url, fileId } → stored on the item row
5. Billing grid requests ?tr=w-300,h-300,f-webp
```

Step 3 matters because routing a 5 MB upload through a serverless function
consumes execution time and can exceed payload limits. Step 5 matters because
the billing grid loads dozens of images at once; ImageKit converts a 4 MB phone
photo to a roughly 20 KB WebP thumbnail on the fly.

Replacing or deleting an image calls ImageKit delete through the storage
adapter, using the stored `image_file_id`.

### 12.3 Users

Create (username, name, role, initial password), deactivate, reset password.

Users are **never deleted** — bills reference them. A superadmin cannot
deactivate their own account, and the system enforces at least one active
superadmin at all times.

### 12.4 Settings

Shop name, address, phone, logo, receipt footer, printer width. All appear on
the printed receipt.

---

## 13. Project structure

Modelled on the `t-genius-user-frontend` application, whose conventions are
adopted deliberately: routing stays thin, every feature owns a self-contained
folder, and page logic lives in a container hook rather than in the component.

```
billing/
├─ src/
│  ├─ app/                                  ROUTING ONLY — thin pages
│  │  ├─ layout.tsx                         <html> + providers
│  │  ├─ globals.css
│  │  ├─ manifest.ts
│  │  ├─ page.tsx                           redirect → /bill
│  │  ├─ login/page.tsx
│  │  ├─ (app)/                             authenticated shell
│  │  │  ├─ layout.tsx                      AppNavbar + Container
│  │  │  ├─ dashboard/page.tsx
│  │  │  ├─ bill/page.tsx
│  │  │  ├─ bills/page.tsx
│  │  │  ├─ bills/[billId]/page.tsx
│  │  │  ├─ reports/
│  │  │  │  ├─ layout.tsx
│  │  │  │  ├─ sales/page.tsx
│  │  │  │  └─ items/page.tsx
│  │  │  └─ administration/                 superadmin only
│  │  │     ├─ layout.tsx                   requireSuperadmin() gate
│  │  │     ├─ items/page.tsx
│  │  │     ├─ categories/page.tsx
│  │  │     ├─ users/page.tsx
│  │  │     ├─ settings/page.tsx
│  │  │     └─ audit/page.tsx
│  │  ├─ print/[billId]/page.tsx            no shell, 80mm print CSS
│  │  └─ api/auth/[...nextauth]/route.ts
│  │
│  ├─ components/
│  │  ├─ ui/                                shadcn primitives
│  │  ├─ layout/                            AppNavbar UserMenu Container
│  │  ├─ providers/                         ThemeProvider SessionProvider
│  │  ├─ custom/                            shared across features
│  │  │  ├─ icons/
│  │  │  ├─ ConfirmDialog.tsx
│  │  │  ├─ DateRangePicker.tsx
│  │  │  ├─ MoneyInput.tsx
│  │  │  ├─ OfflineBanner.tsx
│  │  │  ├─ TableEmptyState.tsx
│  │  │  └─ TableErrorState.tsx
│  │  └─ pages/                             ← page implementations live here
│  │     ├─ bill/
│  │     │  ├─ BillPage.tsx
│  │     │  ├─ components/
│  │     │  │  ├─ CategoryTabs.tsx
│  │     │  │  ├─ MenuGrid.tsx
│  │     │  │  ├─ MenuItemCard.tsx
│  │     │  │  ├─ ItemSearchBox.tsx
│  │     │  │  ├─ CartPanel.tsx
│  │     │  │  ├─ CartLine.tsx
│  │     │  │  ├─ DiscountInput.tsx
│  │     │  │  ├─ PaymentPanel.tsx
│  │     │  │  └─ PriceChangedDialog.tsx
│  │     │  ├─ hooks/
│  │     │  │  ├─ useBillPage.ts            container hook
│  │     │  │  └─ useCartReducer.ts
│  │     │  └─ utils/cart.ts
│  │     ├─ bills/
│  │     │  ├─ BillsTab.tsx
│  │     │  ├─ BillsColumns.tsx
│  │     │  ├─ bill-details/BillDetails.tsx
│  │     │  ├─ components/BillsTableToolbar.tsx
│  │     │  └─ hooks/useBillsTab.ts
│  │     ├─ dashboard/
│  │     │  ├─ DashboardPage.tsx
│  │     │  └─ components/
│  │     │     ├─ StatCard.tsx
│  │     │     ├─ SalesTrendChart.tsx
│  │     │     └─ TopItemsCard.tsx
│  │     ├─ reports/
│  │     │  ├─ components/
│  │     │  │  ├─ ReportDateRangeBar.tsx
│  │     │  │  └─ ExportCsvButton.tsx
│  │     │  ├─ sales/
│  │     │  │  ├─ SalesReportTab.tsx
│  │     │  │  ├─ SalesReportColumns.tsx
│  │     │  │  └─ hooks/useSalesReportTab.ts
│  │     │  └─ items/
│  │     │     ├─ ItemReportTab.tsx
│  │     │     ├─ ItemReportColumns.tsx
│  │     │     └─ hooks/useItemReportTab.ts
│  │     ├─ administration/
│  │     │  ├─ items/
│  │     │  │  ├─ ItemsTab.tsx
│  │     │  │  ├─ ItemsColumns.tsx
│  │     │  │  ├─ create-update-item-dialog/
│  │     │  │  │  ├─ CreateUpdateItemDialog.tsx
│  │     │  │  │  └─ components/ItemImageUploader.tsx
│  │     │  │  ├─ components/
│  │     │  │  │  ├─ ItemsTableToolbar.tsx
│  │     │  │  │  └─ DeleteItemConfirmation.tsx
│  │     │  │  └─ hooks/useItemsTab.ts
│  │     │  ├─ categories/
│  │     │  │  ├─ CategoriesTab.tsx
│  │     │  │  ├─ CategoriesColumns.tsx
│  │     │  │  ├─ create-update-category-dialog/
│  │     │  │  │  └─ CreateUpdateCategoryDialog.tsx
│  │     │  │  └─ hooks/useCategoriesTab.ts
│  │     │  ├─ users/
│  │     │  │  ├─ UsersTab.tsx
│  │     │  │  ├─ UsersColumns.tsx
│  │     │  │  ├─ create-user-dialog/CreateUserDialog.tsx
│  │     │  │  ├─ reset-password-dialog/ResetPasswordDialog.tsx
│  │     │  │  ├─ components/DeactivateUserConfirmation.tsx
│  │     │  │  └─ hooks/useUsersTab.ts
│  │     │  ├─ settings/
│  │     │  │  ├─ ShopSettingsTab.tsx
│  │     │  │  ├─ components/ReceiptPreview.tsx
│  │     │  │  └─ hooks/useShopSettingsTab.ts
│  │     │  └─ audit/
│  │     │     ├─ AuditLogTab.tsx
│  │     │     ├─ AuditLogColumns.tsx
│  │     │     ├─ components/AuditDiffDialog.tsx
│  │     │     └─ hooks/useAuditLogTab.ts
│  │     ├─ login/
│  │     │  ├─ LoginPage.tsx
│  │     │  └─ components/LoginForm.tsx
│  │     └─ print/
│  │        ├─ ReceiptView.tsx
│  │        └─ components/
│  │           ├─ Receipt80mm.tsx
│  │           ├─ Receipt58mm.tsx
│  │           └─ AutoPrintTrigger.tsx
│  │
│  ├─ server/                               data layer (see §13.2)
│  │  ├─ bills/
│  │  │  ├─ bills-actions.ts                "use server" entry points
│  │  │  ├─ bills-queries.ts                RSC reads
│  │  │  └─ create-bill-service.ts          the transaction (§8.2)
│  │  ├─ items/
│  │  │  ├─ items-actions.ts
│  │  │  └─ items-queries.ts
│  │  ├─ categories/
│  │  │  ├─ categories-actions.ts
│  │  │  └─ categories-queries.ts
│  │  ├─ users/
│  │  │  ├─ users-actions.ts
│  │  │  └─ users-queries.ts
│  │  ├─ reports/reports-queries.ts
│  │  ├─ settings/
│  │  │  ├─ settings-actions.ts
│  │  │  └─ settings-queries.ts
│  │  └─ audit/
│  │     ├─ audit-queries.ts
│  │     └─ write-audit-log.ts
│  │
│  ├─ db/
│  │  ├─ schema/
│  │  │  ├─ enums.ts
│  │  │  ├─ users.ts
│  │  │  ├─ categories.ts
│  │  │  ├─ items.ts
│  │  │  ├─ bills.ts
│  │  │  ├─ bill-items.ts
│  │  │  ├─ bill-counters.ts
│  │  │  ├─ audit-log.ts
│  │  │  ├─ shop-settings.ts
│  │  │  └─ index.ts
│  │  ├─ index.ts                           drizzle + Neon Pool (§4.3)
│  │  ├─ migrations/
│  │  └─ seed.ts
│  │
│  ├─ lib/
│  │  ├─ auth/
│  │  │  ├─ guard.ts                        requireUser / requireSuperadmin
│  │  │  ├─ password.ts                     bcrypt hash + verify
│  │  │  └─ logout.ts
│  │  ├─ storage/
│  │  │  ├─ index.ts                        upload() / delete() adapter (§4.5)
│  │  │  └─ imagekit.ts
│  │  ├─ routes/
│  │  │  ├─ bill-routes.ts
│  │  │  ├─ report-routes.ts
│  │  │  └─ administration-routes.ts
│  │  ├─ validation/
│  │  │  ├─ bill-schema.ts
│  │  │  ├─ item-schema.ts
│  │  │  ├─ category-schema.ts
│  │  │  ├─ user-schema.ts
│  │  │  └─ settings-schema.ts
│  │  ├─ utils/
│  │  │  ├─ cn.ts
│  │  │  ├─ money.ts                        §11.3 — the only money math
│  │  │  ├─ dates.ts                        business-date helpers (§6.11)
│  │  │  ├─ csv.ts
│  │  │  ├─ result.ts                       ActionResult helpers (§11.1)
│  │  │  ├─ parse-db-error.ts
│  │  │  └─ index.ts
│  │  └─ brand.ts
│  │
│  ├─ hooks/                                global hooks, kebab-case
│  │  ├─ use-debounce.ts
│  │  ├─ use-media-query.ts
│  │  ├─ use-mobile.ts
│  │  ├─ use-online-status.ts               §11.4 offline banner
│  │  └─ use-url-pagination.ts
│  │
│  ├─ types/
│  │  ├─ api.types.ts
│  │  ├─ bill.types.ts
│  │  ├─ item.types.ts
│  │  ├─ category.types.ts
│  │  ├─ user.types.ts
│  │  ├─ report.types.ts
│  │  ├─ settings.types.ts
│  │  ├─ audit.types.ts
│  │  └─ next-auth.d.ts
│  │
│  ├─ constants/
│  │  ├─ payment-methods.ts
│  │  ├─ roles.ts
│  │  └─ audit-actions.ts
│  │
│  ├─ auth.config.ts
│  ├─ auth.ts
│  └─ middleware.ts
│
├─ public/
│  └─ images/
│     ├─ logo/
│     └─ favicon/{dark,light}/
├─ docs/
│  ├─ superpowers/
│  │  ├─ specs/
│  │  └─ plans/
│  ├─ printer-setup.md                      handover doc for the client
│  └─ deployment.md
├─ components.json
├─ drizzle.config.ts
├─ netlify.toml
├─ next.config.mjs
├─ postcss.config.mjs
├─ tsconfig.json
├─ .env.template
├─ CLAUDE.md
└─ README.md
```

### 13.1 Conventions

**1. `src/app/` is routing only.** A `page.tsx` exports `metadata` and renders
one component from `components/pages/`. Target: under 15 lines, no logic.

```tsx
import { UsersTab } from "@/components/pages/administration/users/UsersTab";

export const metadata = {
  title: "Users | Administration | <Shop Name>",
  description: "Manage billing accounts and roles.",
};

export default function UsersPage() {
  return <UsersTab />;
}
```

**2. Features own their folder.** Each `components/pages/<feature>/` contains
its entry component plus `components/`, `hooks/`, `constants/` and `utils/` as
needed. Nothing reaches sideways into another feature; anything two features
need moves up to `components/custom/`.

**3. Dialogs get their own folder** — `create-update-item-dialog/`, with its
own `components/` subfolder when it grows. Dialogs are where these apps
accumulate complexity, so they are isolated from the start.

**4. Table pages split three ways** — `XTab.tsx` (composition),
`XColumns.tsx` (column definitions), `hooks/useXTab.ts` (state and handlers).
Column definitions are verbose and would otherwise dominate the page file.

**5. The container-hook rule.** Page logic — data fetching, mutations, dialog
open state, filters — lives in `hooks/use<Feature>Tab.ts`. The component stays
presentational. This is the convention that keeps the reference project's page
components readable, and it is the one most worth preserving.

**6. Server code stays thin at the edge.** A file in `server/<domain>/<domain>-actions.ts`
does four things: guard, validate, call a service or query, return an
`ActionResult`. Real logic lives in `*-service.ts` and `*-queries.ts` as plain
functions readable in isolation.

**7. Naming.**

| Kind | Convention | Example |
|---|---|---|
| Components | PascalCase `.tsx` | `CartPanel.tsx` |
| Feature hooks | camelCase | `useItemsTab.ts` |
| Global hooks | kebab-case | `use-debounce.ts` |
| `server/`, `db/`, `lib/` files | kebab-case | `create-bill-service.ts` |
| Types | `<domain>.types.ts` | `bill.types.ts` |
| Route folders | kebab-case | `administration/audit/` |

**8. Path alias** `@/*` → `src/*`, declared in `tsconfig.json`.

### 13.2 Two deliberate deviations from the reference

**`src/server/` replaces `src/lib/api/`.** The reference is a frontend talking
to a separate backend over axios, so its per-domain folders hold HTTP clients
(`users-api.ts`). This app is full-stack: the same per-domain folder shape and
responsibility-suffixed filenames are kept, but the files contain Server
Actions and Drizzle queries instead of HTTP calls. `lib/axios.ts` has no
equivalent here.

**The `(app)` route group.** The reference has no shell-free route, so its
segments nest directly under `app/`. This app needs `/print/[billId]` to render
with no navigation at all. The `(app)` group gives the navbar layout to
authenticated pages while `login/` and `print/` opt out, and the root
`layout.tsx` stays providers-only exactly as in the reference.

---

## 14. Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_SECRET` | Auth.js signing secret |
| `AUTH_URL` | Deployment URL |
| `IMAGEKIT_PRIVATE_KEY` | Server-side signing |
| `IMAGEKIT_PUBLIC_KEY` | |
| `IMAGEKIT_URL_ENDPOINT` | |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | Browser direct upload |
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | Browser direct upload |
| `SEED_SUPERADMIN_USERNAME` | Seed script only |
| `SEED_SUPERADMIN_PASSWORD` | Seed script only |
| `SEED_SUPERADMIN_NAME` | Seed script only |

Documented in `.env.template`. Real values are never committed.

---

## 15. Milestones

| # | Milestone | Estimate |
|---|---|---|
| **M0** | Scaffold: Next.js + TS strict, Tailwind, shadcn, Netlify config, Neon project, Drizzle with WebSocket driver. **Deploy a blank page first** to prove the pipeline before writing features. | ½ day |
| **M1** | Full schema, migrations, immutability triggers, indexes, seed script. Manually verify each trigger rejects what it should. | 1 day |
| **M2** | Login page, Auth.js credentials, JWT session, middleware, role guards, lockout, logout, app shell with role-aware navigation. | 1 day |
| **M3** | **Billing and printing** — menu grid, search, cart, discount, payment, the `createBill` transaction (gapless, idempotent), `/print/[billId]` with 80mm CSS, auto-print, reset. *First client demo.* | 2–3 days |
| **M4** | Item and category management, soft delete, ImageKit signed direct upload, audit logging on every mutation. | 1–2 days |
| **M5** | Dashboard, sales report, item-wise report, bills ledger, bill detail, reprint, CSV export, charts. | 2 days |
| **M6** | User management, password reset, shop settings, audit log viewer, export-all-data. | 1 day |
| **M7** | Empty/loading/error states, mobile pass, `printer-setup.md`, `deployment.md`, seed the client's real menu, walkthrough. | 1 day |

**Total: approximately 10–12 working days**, one developer, executed serially.

---

## 16. Known limitations and risks

### 16.1 Backup window on the free tier

Neon's free plan retains only a short restore window — hours, not days.
**Confirm the exact current retention on Neon's pricing page during M0**, since
free-tier limits change; the mitigations below assume the worst case either
way. This system stores a business's sales ledger, so if a table is dropped or
corrupted and nobody notices for a week, the free plan will not recover it.

Mitigations, both cheap:

1. An **Export all data** action (superadmin) producing CSVs of bills, bill
   items and items. The client runs it monthly and keeps the file.
2. The `pg_dump` command documented in `docs/deployment.md`, to be run before
   any schema change.

Moving to a paid Neon plan extends the restore window and supersedes most of
this.

### 16.2 Cold starts

The first request after idle takes 1–2 seconds (§11.4). Acceptable for a shop
opening in the morning; removed by a paid Neon plan.

### 16.3 No automated tests

Verification is manual by client decision. The mitigation is structural: money
handling is confined to four small pure functions, and the most dangerous
invariants — immutability, gapless numbering, total arithmetic — are enforced
by database constraints and triggers rather than by application code.

### 16.4 Netlify free tier limits

100 GB bandwidth and 300 build minutes per month. Both are far above this
application's needs, but they are shared across the account.

---

## 17. Open items for the client

1. **Bill void / cancel.** Scoped out of v1, schema ready. Without it, a
   mistake discovered after printing has no in-app resolution. Recommended for
   v2, roughly half a day.
2. **Real menu data** required before M7 handover.
3. **Shop details** — name, address, phone, logo, receipt footer text.
4. **Thermal printer model** confirmation before the M3 demo.
