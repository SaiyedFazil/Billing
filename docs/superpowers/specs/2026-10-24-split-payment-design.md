# Split Payment — Design

Date: 2026-10-24 · Status: approved by the owner, 2026-10-24

Lets one bill be paid with more than one payment method, for example a ₹500
bill paid with ₹400 cash and ₹100 UPI. The till layout is "Option A" from the
brainstorming mockups: a **Split** button next to Cash, UPI, Card and Other,
with the split entered directly in the bill panel.

## 1. Intent

Today every bill stores exactly one payment method. When a customer pays part
in cash and part online, the cashier has no correct way to record it. Any
choice they make leaves either the cash drawer or the online total wrong in
the Cash book and the sales report.

The client describes two situations, and both happen:

- The customer is short of cash ("I only have ₹400"), so they pay the rest
  online.
- The shop decides to take part in cash and part online, for its own reasons.

So the split can be at any ratio, decided by either side, and the cashier
must record the amounts that were actually received.

This follows the standard "split payment" (also called "split tender" or
"part payment") approach used by restaurant POS systems:

- a bill has one or more **payment lines**, each a method and an amount
- the lines must add up to the bill total exactly
- change is only ever given from cash
- every money figure (cash drawer, online total, payment breakdown) counts
  the line amounts, not the bill's total under a single method

Success means: the cashier can ring up the ₹400 + ₹100 bill in a few taps; the
receipt shows both payments; and that evening the Cash book shows ₹400 in cash
and ₹100 online, with no paisa of drift. Every bill paid by one method behaves
exactly as it does today, except that the broken "Charge the new total" step
after a price change now works (§9.4, client decision).

## 2. Goals

1. The cashier can split a bill across two or more of the payment methods the
   owner has enabled, each method used at most once per bill.
2. The cashier types the amounts. The last line fills in the rest
   automatically, and the panel always shows how much is still to collect.
3. The cashier can optionally enter the cash the customer handed over and see
   the change, as they can today for a cash bill.
4. A bill cannot be saved, by the till or by any other path, unless its
   payment lines add up exactly to its total. The database enforces this.
5. The receipt, the Bills list, the bill details page, the Sales report's
   payment breakdown, the Cash book and the backup export all show the split
   correctly.
6. Every existing bill is converted to one payment line without changing any
   past figure.

## 3. Non-goals

- **Pay later / credit (udhaar).** The customer pays ₹400 now and owes ₹100.
  Every saved bill is fully paid.
- **Splitting a bill between people**, by item or evenly ("you pay for the
  burger, I pay for the fries").
- **UPI transaction references** or card slip numbers on a payment line.
- **Changing how a saved bill was paid.** Bills stay immutable. A wrong
  payment is fixed the way it is today: void the bill and ring it up again.
- Tips, refunds, partial voids, or paying one method twice on the same bill
  (for example two UPI payments). Two UPI payments are recorded as one UPI
  line for their total.
- A setting to turn split payment on or off. It is available whenever two or
  more methods are enabled.
- Any change to the Dashboard.

## 4. Anti-goals (a failure even if it "works")

- A JavaScript `number` anywhere in a payment amount, or any total off by a
  paisa.
- A saved bill whose payment lines do not add up to its total, by any path.
- **Any past figure changing after the migration:** a day's Cash book, a
  Sales report payment breakdown, or a receipt reprint of an old bill.
- **A one-method bill behaving differently:** extra taps, a different
  receipt, a different wire payload, or a different Bills list row. The
  price-change fix (§9.4) is the one deliberate exception.
- A split total counted twice anywhere. For example, a ₹500 split bill must add
  ₹500 to Net sales, not ₹1,000.
- The till offering a disabled method in a split, or the server accepting
  one.

## 5. Decisions

| Question                           | Decision                                                                       | By       |
| ---------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Who decides the split              | Either the customer or the shop, any ratio                                     | Client   |
| Till layout                        | Option A: a **Split** button, worked out in the bill panel                     | Client   |
| Which methods can combine          | Any enabled methods, each at most once, 2 to 4 lines                           | Our call |
| Change                             | Only from the cash line; "cash given" is optional, as today                    | Our call |
| Default lines when Split is tapped | Cash first, then the first enabled non-cash method as "the rest"               | Our call |
| How a split bill is labelled       | "Split" everywhere a bill shows its method                                     | Our call |
| Bills filter "Cash"                | Finds every bill with a cash line, split ones included; new "Split" option too | Our call |
| Sales report bill counts           | A split bill counts under each method it used; the card says so                | Our call |
| Price-change bug                   | Fix it for every bill: the bill takes the new prices, then saves (§9.4)        | Client   |
| Price change while splitting       | Re-balance the auto line; the cashier presses Save again; never auto-submit    | Our call |
| Go-live                            | After closing: one migration, then deploy straight away (§6.4)                 | Client   |
| Storage                            | New `bill_payments` table; `bills.payment_method` gains `SPLIT`                | Our call |
| Existing bills                     | Backfilled with one payment line each, in the migration                        | Our call |
| On/off setting                     | None. Split shows whenever two or more methods are enabled                     | Our call |

## 6. Data model

### 6.1 Enum `payment_method`: add `SPLIT`

`payment_method` becomes `CASH`, `UPI`, `CARD`, `OTHER`, `SPLIT`.

- `SPLIT` is only ever a **bill-level label**. It is never a payment line's
  method, never an enabled till method, and never stored in
  `shop_settings.payment_methods`. CHECKs on `bill_payments` (§6.3) and on
  `shop_settings` (`NOT ('SPLIT' = ANY(payment_methods))`), plus Zod, enforce
  this.
- In TypeScript, `PAYMENT_METHODS` (the four methods the till offers) does
  **not** change. Add a separate type for a bill's label, for example
  `BillPaymentMethod = PaymentMethod | "SPLIT"`, with its own label ("Split").
  The settings schema, the till buttons and every `Record<PaymentMethod, …>`
  stay on the four real methods.

**Migration trap:** `ALTER TYPE … ADD VALUE` cannot be used in the same
transaction that adds it. `scripts/migrate.ts` runs each statement on its own
(no wrapping transaction), so it works if the `ADD VALUE` statement comes
before anything that mentions `'SPLIT'`. Do not switch to `drizzle-kit
migrate`, which wraps all pending migrations in one transaction and would
fail here.

### 6.2 `bills`: unchanged columns, new meaning for split bills

No column is added or removed. The bill keeps a summary of how it was paid:

| Bill kind  | `payment_method` | `tendered` / `change_due`              |
| ---------- | ---------------- | -------------------------------------- |
| One method | that method      | exactly as today (cash only, nullable) |
| Split      | `SPLIT`          | both `NULL`; the cash line holds them  |

New CHECK: `payment_method <> 'SPLIT' OR (tendered IS NULL AND change_due IS
NULL)`. The existing `bills_change_matches` CHECK stays as it is.

The `restrict_bill_update` trigger already freezes these columns, so nothing
changes there.

### 6.3 `bill_payments` (new)

**`bill_payments` is the source of truth for how a bill was paid.** Every
bill, one-method or split, has at least one row.

| Column       | Type                                   | Notes                                        |
| ------------ | -------------------------------------- | -------------------------------------------- |
| `id`         | `uuid` PK                              |                                              |
| `bill_id`    | `uuid` → `bills`, `on delete restrict` |                                              |
| `method`     | `payment_method` not null              | never `SPLIT`                                |
| `amount`     | `numeric(10,2)` not null               | what this line pays toward the bill total    |
| `tendered`   | `numeric(10,2)` nullable               | cash handed over; cash line only             |
| `change_due` | `numeric(10,2)` nullable               | `tendered − amount`                          |
| `position`   | `smallint` not null                    | display order on receipt and details, from 1 |
| `created_at` | `timestamptz` default now              |                                              |

Constraints:

- `UNIQUE (bill_id, method)`: one line per method per bill.
- `UNIQUE (bill_id, position)`.
- `CHECK (method <> 'SPLIT')`.
- `CHECK (amount >= 0)`. Zero is allowed only so that a ₹0 bill (a 100%
  discount) can still have its single line. The deferred check below rejects a
  zero line on a split bill.
- `CHECK ((tendered IS NULL AND change_due IS NULL) OR (method = 'CASH' AND
tendered >= amount AND change_due = tendered - amount))`.
- Index on `(bill_id)`, and on `(method)` for the reports.

**Immutable:** a trigger rejects every `UPDATE` and `DELETE`, the same as
`bill_items` (`0001_immutability_triggers.sql`). Voiding a bill only updates
`bills.status`, so voiding still works and the lines stay as the record of
what was paid.

**Deferred consistency check:** add a constraint trigger, `DEFERRABLE
INITIALLY DEFERRED`, `AFTER INSERT` on both `bills` and `bill_payments`. At
commit it checks the affected bill:

- the sum of its lines' `amount` equals `bills.total`
- if `bills.payment_method = 'SPLIT'`: at least two lines, each `amount > 0`
- otherwise: exactly one line, and its `method` equals `bills.payment_method`;
  for a cash bill, its `tendered` and `change_due` equal the bill's

It runs at COMMIT, so a violation throws out of `db.transaction()` and rolls
back the bill, its number and its stock deduction together (non-negotiable 6
holds). It also catches a bill inserted with no payment lines at all.

### 6.4 Migration and backfill

The update runs **after closing**, when no till is saving bills (client
decision). Order matters. Use one generated migration plus one hand-written
one, as with `0003` and `0004`, and keep `_journal.json` in sync:

1. `ALTER TYPE payment_method ADD VALUE 'SPLIT'`, as a statement on its own.
2. Create `bill_payments` with its CHECKs and indexes, and add the new `bills`
   and `shop_settings` CHECKs.
3. Create the trigger functions.
4. In **one `DO` block**, so that it is all-or-nothing:
   - **Backfill** one line for every bill that has none, voided bills
     included: `method = payment_method`, `amount = total`, `tendered`,
     `change_due`, `position = 1`, `created_at = bills.created_at`.
   - Then create the immutability trigger and the deferred consistency
     triggers.

   No bill can slip in between the backfill and the triggers. A bill that does
   not fit (for example, a non-cash bill carrying `tendered`) makes the
   migration fail loudly rather than be skipped.

**Go-live checklist** (add it to `docs/deployment.md`):

1. After closing, take the backup, as for every migration.
2. Prove the migration first on a Neon branch of the live database:
   - Run `db:migrate`, then `verify:report-queries`. Its data audit checks
     that every bill's lines add up to its total, and that every one-method
     bill's line matches the bill.
   - Compare the Sales report payment breakdown and the Cash book for the last
     90 days, before and after. They must match to the paisa.
3. Run `db:migrate` on the live database, then deploy straight away. The old
   till cannot save bills between the two.
4. Ring up one cash bill and one split bill, check both receipts, then void
   both test bills.

## 7. Money

The existing rules apply unchanged:

- decimal strings end to end, `numeric(10,2)` in Postgres
- arithmetic through `money.ts`; "the rest" is `subtract(total, sum(others))`
- sums done in SQL, returned as `::text` and passed through `toAmount()`
- display through `formatINR()`, with `tabular-nums`

Payment amounts cross the wire as validated decimal strings, never
`z.number()`. These are the amounts paid, not prices. Prices still never come
from the client (non-negotiable 3), and the server still recalculates the
total itself.

## 8. Saving a bill

### 8.1 Wire payload

**A one-method bill's payload does not change.** `paymentMethod`, `tendered`
and `expectedTotal` mean exactly what they mean today.

A split bill sends `paymentMethod: "SPLIT"` plus its lines:

```ts
paymentMethod: PaymentMethod | "SPLIT";
tendered: string | null; // cash given; single CASH bill, or a split with a cash line
splitPayments: Array<{ method: PaymentMethod; amount: string }> | null;
// required when SPLIT, null otherwise
```

The exact field names are the builder's call; the rule that the single-method
shape stays the same is not.

### 8.2 Validation in `create-bill-service.ts`

All of these checks run **before** the transaction opens, after the existing
`PRICE_CHANGED` check, so the amounts are compared against the server's own
total:

- `SPLIT` requires 2–4 lines with distinct methods. A non-split bill must not
  send lines.
- Every line's method is enabled (the same `CONFLICT` message as today, naming
  the method).
- Every split amount is greater than 0.
- The line amounts add up exactly to the recalculated total. If not, return
  `VALIDATION` with "The payments don't add up to the bill total."
- `tendered` on a split is allowed only with a cash line, and must be at least
  that line's amount.

Inside the transaction, after the `bills` insert, insert the `bill_payments`
rows. A one-method bill writes one line: `amount = total`, plus `tendered`
and `change_due` for cash. A split bill writes its lines in the order the
cashier entered them, with `tendered` and `change_due` on the cash line.

Idempotency is unchanged: a replay returns the original bill and writes
nothing.

## 9. The till (Option A)

The layout follows the brainstorming mockup
(`.superpowers/brainstorm/…/split-payment-till.html`, which is local only and
not committed) and uses Ember tokens. This section is the authority wherever
the two differ.

### 9.1 The Split button

- A fifth button, **Split**, after the enabled methods in `PaymentPanel`, with
  the same size and selected style. Add `5: "grid-cols-5"` to `GRID_COLUMNS`.
- It appears only when two or more methods are enabled. With one method there
  is nothing to split.
- Tapping Cash, UPI, Card or Other at any time goes back to a one-method bill
  and discards the split lines.

### 9.2 Split lines

When Split is tapped:

- Line 1 is **Cash**, empty, with the cursor in it. If Cash is not enabled,
  line 1 is the first enabled method.
- Line 2 is the first remaining enabled method (normally UPI). It is the
  **auto line**: its amount is always `total − sum(other lines)`, and it shows
  a small "the rest" tag.
- The cashier types into line 1, and line 2 follows. Typing into the auto line
  makes it a normal line. The tag disappears and it no longer follows.
- Chips under the lines add any remaining enabled method (**+ Card**,
  **+ Other**). A newly added line becomes the auto line (it takes the
  remaining amount), and the previous auto line keeps its current amount.
- Each line has ✕ to remove it. ✕ is hidden when only two lines remain; to go
  back to one method, the cashier taps that method's button.
- Discount or cart changes re-balance the auto line live, because it is
  derived rather than stored.
- **Cash given:** when a cash line exists, an optional "Cash given" field sits
  under it. When it's filled, "Change ₹…" shows (`given − cash line`). If it is
  less than the cash line, the status says so and Save stays locked, the same
  as the rule for a cash bill today.

### 9.3 Status bar and Save

A status line under the split lines, always visible while splitting:

| State                  | Tone    | Text                   | Save   |
| ---------------------- | ------- | ---------------------- | ------ |
| Lines add up to less   | warning | "Collect ₹100.00 more" | locked |
| Lines add up exactly   | success | "Fully paid"           | open   |
| Lines add up to more   | error   | "₹50.00 too much"      | locked |
| A line is ₹0 or empty  | warning | names the line         | locked |
| Cash given < cash line | warning | "Cash given is short"  | locked |

If the cash typed already covers the whole bill (the auto line would be ₹0),
the status suggests tapping **Cash** instead.

### 9.4 Price change (fixed for every bill)

**Today's bug.** If the owner changes a price while a bill is open, saving
returns `PRICE_CHANGED`, but "Charge the new total" sends the old total again
and gets the same error. A fresh menu updates a bill line's stock cap but never
its price, and the confirm step submits before the refresh has landed. The
only way out today is to remove the item and add it back. The client chose to
fix this for every bill.

**The fix:**

- **New prices reach the bill.** When the till loads a fresh menu, every line
  on the bill takes the item's current price as well as its current stock
  cap. The till names the lines whose price changed, in their own toast
  ("Prices updated: Fish Burger"), separate from the existing stock toast.
- **The server says the new total.** `PRICE_CHANGED` carries the server's
  recalculated total as a decimal string, so the till can tell when its screen
  matches.
- **On `PRICE_CHANGED`,** the till reloads the menu straight away, so the bill
  re-prices while the dialog is open. The dialog shows the new total.
  "Charge the new total" is enabled only once the bill on screen shows that
  same total. The till never charges an amount the screen doesn't show. If the
  reload changed the bill in some other way, for example an item sold out, the
  dialog asks the cashier to check the bill and save again.
- **One-method bill:** pressing "Charge the new total" saves at the new total
  with the same idempotency key, as intended today.
- **Split bill:** pressing it closes the dialog without saving. The auto line
  has already re-balanced to the new total. The cashier checks the amounts
  (the customer may now owe a different amount on each method) and presses
  Save again.

### 9.5 Methods disabled mid-split

If a refresh shows that the owner has disabled a method that is on a split
line, drop that line. If fewer than two lines remain, fall back to the
default method, the same way the till already falls back today. The server
rejects it either way.

### 9.6 Fit and touch

- Every control is at least 40px tall (the till rule).
- The ticket stub grows while splitting; the item list above it scrolls. Save
  & Print must stay on screen at 1366×768 and at phone width. If it does not,
  the stub's split area may scroll on its own.
- Keyboard: Tab moves between amount fields. Whether Enter saves is the
  builder's call, but it must never save a bill that isn't fully paid.

### 9.7 Where the logic lives

The split maths (auto line, status, can-save) are pure functions in the bill
page's `utils/` folder (next to `cart.ts`), so an offline verify script can
check them. The state lives in `useBillPage`, or in a `useSplitPayment` hook
it calls. Reset for the next customer clears the split.

## 10. Everywhere else

### 10.1 Receipt (`Receipt80mm`, both widths)

A one-method bill prints **exactly as today**. A split bill prints one line per
payment under TOTAL, then cash given and change only if they were entered:

```
TOTAL                 500.00
Paid: Cash            400.00
Paid: UPI             100.00
Cash given            500.00
Change                100.00
```

`getReceipt()` returns the payment lines (ordered by `position`) as well as
the bill. The receipt stays monospace black-on-white (it is not part of the
design system).

### 10.2 Bills list and bill details

- **Payment column:** a split bill shows "Split" with one dot per method used
  (the `PAYMENT_METHOD_DOT` colours). Hover or `title` text gives
  "Cash ₹400.00 · UPI ₹100.00". One-method rows are unchanged.
- **Payment filter:** gains **Split**. Choosing a method (for example Cash)
  matches every bill that has a line with that method, split bills included,
  using `EXISTS` on `bill_payments`. The page's URL parser accepts `SPLIT`.
- **Bill details, "Paid by":** for a split bill, one row per line (method dot,
  label, amount), then Cash given and Change if entered. One-method bills are
  unchanged.

### 10.3 Sales report, "By payment method"

`getPaymentBreakdown` reads `bill_payments` joined to completed bills in range,
grouped by `method`:

- `net = sum(amount)`, so the methods add up exactly to Net sales.
- `billCount = count(*)`. This is one line per bill per method, thanks to the
  unique key, so it counts distinct bills.
- `SPLIT` never appears as a row.
- When the range contains any split bill, the card shows a one-line note: "A
  split bill is counted under each method it used." This explains why the
  counts can add up to more than the number of bills.

### 10.4 Cash book

`getCashBook` reads the bill side from `bill_payments` joined to completed
bills in range, grouped by `business_date` and `method`, summing `amount`.
`buildCashBookDays` and `billMethodGroup` do not change. They already take
rows of `{ date, paymentMethod, total }`, so ₹400 lands in cash and ₹100 in
online.

### 10.5 Backup export and scripts

- `exportAllDataAction`: the bills CSV keeps its **Payment** column (`SPLIT`
  for a split bill) and adds a last column, **Payment details**, for example
  `Cash 400.00; UPI 100.00` (using `csvAmount`). The bundle gains a
  `billPayments` CSV (bill number, date, method, amount, cash given, change,
  bill id). Update the Settings backup UI and any docs that list the bundle's
  files.
- `scripts/dump-json.ts`, `db-drop-all.ts` and `reset-bills.ts` include
  `bill_payments` and its triggers and functions. `reset-bills` disables
  `bill_payments_immutable` around its delete, deletes the lines before the
  bills, and confirms seven immutability triggers instead of six. The deferred
  triggers fire on `INSERT` only, so a delete never trips them.

### 10.6 Every other reader of `bills.payment_method`

Search for `paymentMethod` and `payment_method` across `src/` and `scripts/`.
**No money figure may be summed by `bills.payment_method` any more**, because
a `SPLIT` bill's money belongs to its lines. Displaying the label is fine.

## 11. Edge cases

- **₹0 bill** (100% discount): one-method only, with one ₹0 line. Split is
  not offered when the total is ₹0.
- **Voided split bill:** voids the whole bill, and its lines drop out of every
  figure, because every query filters on `bills.status = 'COMPLETED'`.
- **Double tap on Save:** the idempotency key returns the first bill; no
  second set of lines is written.
- **Two tills, last unit of stock:** unchanged. The stock check still throws
  inside the transaction and rolls back the payment lines with the bill.
- **58 mm printer:** the labels ("Paid: Cash", "Cash given") fit the narrow
  receipt.
- **Owner enables only Cash and UPI:** Split shows; the chips offer nothing
  more to add.
- **Phone width:** five method buttons fit in one row at 360px (each about
  64px wide). No horizontal page scroll.

## 12. What does not change

- A one-method bill, from the first tap to the printed receipt, and its
  payload, apart from the price-change fix (§9.4).
- Bill numbering, idempotency, stock deduction, voiding.
- The What's selling report, the Dashboard, the Items, Categories, Users and
  Settings pages.
- The rules in `CLAUDE.md`. This feature follows all of them.

## 13. Verification

No test framework (client decision). Extend and add:

- **`verify:split-payment`** (new, offline, added to `verify:offline`): the
  till's pure split maths, covering the auto line, re-balancing after a
  discount, every status-bar state, can-save, and the float-trap values
  (`60.50 + 40.30 − 10` split across two lines).
- **`verify:bill`**:
  - A split bill saves with the right lines, `payment_method = 'SPLIT'`, and
    NULL bill-level tendered.
  - Cash given on a split gives the right change.
  - Rejected: lines that don't add up, a duplicate method, `SPLIT` with one
    line, a ₹0 split line, a disabled method, and cash given below the cash
    line.
  - A one-method bill writes exactly one matching line.
  - An idempotent replay writes nothing.
- **`db:verify`** (constraints): rejects a bill with no lines, a line sum ≠
  total, a `SPLIT` bill with one line, a one-method bill whose line method
  differs, and a `SPLIT` line method. Checks the `bill_payments` tendered CHECK.
- **`db:verify-immutability`:** `UPDATE` and `DELETE` on `bill_payments` are
  rejected, and voiding a split bill still works.
- **`verify:report-queries`:**
  - The payment breakdown and the Cash book for a fixture with split bills
    match hand-computed figures to the paisa. A split bill adds its total to
    Net once.
  - A **data audit**: every bill's lines add up to its total, and every
    one-method bill has exactly one line that matches it. This is the
    migration proof (§6.4), and it keeps proving it afterwards.
- **`verify:stock-utils`:** a fresh menu re-prices the bill's lines and names
  them, separately from the stock changes (§9.4).
- **Existing scripts that insert bills directly** (`verify-constraints.ts`,
  `verify-immutability.ts`) must also insert a payment line, or the deferred
  check fails them at commit.
- **Migration proof** (§6.4) on a Neon branch of live data before deploying.
- `npm run verify:all` and `npm run build` pass.
- **Look at the screen:** run the dev server and ring up the ₹400 + ₹100 bill
  at desktop (1920 and 1366 wide) and phone widths. Print it on both receipt
  widths, then check the Bills list, the bill details, the Sales report and
  the Cash book. Ring up a normal cash bill and confirm nothing about it
  changed. Change an item's price in another tab while a bill is open, then
  press Save. "Charge the new total" must save a one-method bill at the new
  total, and must return a split bill to the panel with the auto line
  re-balanced.

Update `CLAUDE.md`: add this spec to the doc table, add `verify:split-payment`
to the verify table, and add a non-negotiable: **how a bill was paid lives in
`bill_payments`; never sum money by `bills.payment_method`.**

## 14. Left to the builder

- Wire field names (§8.1), and whether split state lives in `useBillPage` or
  its own hook.
- The Split button's icon.
- How the Bills list shows several method dots for a split bill.
- Whether Enter saves from a split amount field (§9.6).
- Whether the stub's split area scrolls on its own on short screens.
- How the generated and hand-written migrations are split, within the order in
  §6.4.
- How `PRICE_CHANGED` carries the new total (§9.4), for example in the
  error's `fields`.
