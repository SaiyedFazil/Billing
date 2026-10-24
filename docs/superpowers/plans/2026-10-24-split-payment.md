# Split Payment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One bill can be paid with several methods (₹400 cash + ₹100 UPI), recorded exactly in every money figure, and the broken "Charge the new total" price-change step is fixed for every bill.

**Architecture:** A new immutable `bill_payments` table holds how every bill was paid: one line for a normal bill, two to four for a split. `bills.payment_method` gains a `SPLIT` label. A deferred constraint trigger refuses, at commit, any bill whose lines don't add up to its total. Pure planners do the money rules: `planPayments` on the server, and the split maths for the till. Both are verified offline. Reports and the Cash book sum the lines, never `bills.payment_method`.

**Tech Stack:** Next.js 16 App Router, Drizzle + Neon (`neon-serverless` Pool), Zod 4, big.js via `money.ts`, Tailwind v4 + shadcn/ui (Ember tokens), tsx verify scripts (no test framework).

**Spec:** `docs/superpowers/specs/2026-10-24-split-payment-design.md`. Read it alongside this plan. § numbers below refer to it.

## Global Constraints

- **Branch and commits:**
  - Create `feature/split-payment` from the current `test` HEAD.
  - The first commit is the spec and this plan.
  - Commit each task on its own, after `npm run typecheck` and `npm run lint` pass.
- **Money:**
  - Money is a decimal string end to end. No `number` in an amount path, and no `z.number()` for an amount.
  - SQL sums come back `::text` and go through `toAmount()`. Inside `json_build_object`, cast every amount `::text`, because a JSON number parses as a JS double.
  - Arithmetic goes through `money.ts`.
- **Writing bills:**
  - Inside `db.transaction`, only throw (non-negotiable 6). Every check that can fail runs before the transaction opens.
  - Bills and their lines are never updated or deleted. Voiding updates `bills.status` only.
- **Migrations:** run them with `npm run db:migrate` (`scripts/migrate.ts`, one statement at a time, no wrapping transaction). Never use `drizzle-kit migrate` (§6.1).
- **Method lists:**
  - `PAYMENT_METHODS` stays the four methods the till offers. `SPLIT` is a bill-level label only.
  - It is never a line's method, never an enabled method, and never a key of a `Record<PaymentMethod, …>`.
- **Database names:**

  | Kind       | Names                                                                                                                                                                                           |
  | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Table      | `bill_payments`                                                                                                                                                                                 |
  | CHECKs     | `bill_payments_not_split`, `bill_payments_amount_non_negative`, `bill_payments_position_positive`, `bill_payments_tender_matches`, `bills_split_has_no_tender`, `shop_settings_no_split_method` |
  | Indexes    | unique `bill_payments_bill_method_idx` (bill_id, method), unique `bill_payments_bill_position_idx` (bill_id, position), `bill_payments_method_idx` (method)                                     |
  | Functions  | `prevent_bill_payment_mutation()`, `assert_bill_payments_balance(uuid)`, `check_bill_payments_on_bill()`, `check_bill_payments_on_line()`                                                       |
  | Triggers   | `bill_payments_immutable`, plus the deferred constraint triggers `bills_payments_balance` (on `bills`) and `bill_payments_balance` (on `bill_payments`)                                         |
  | Error text | every balance failure message starts `bill_payments_balance:`; the immutability message is `bill_payments are immutable: % is not permitted`                                                    |

- **Exact copy, server (`planPayments`):**
  - `Choose at least two payment methods to split a bill.`
  - `Each payment method can be used only once on a bill.`
  - `Every split payment must be more than ₹0.`
  - `The payments don't add up to the bill total.`
  - `Cash given needs a cash payment in the split.`
  - `Cash given is less than the cash part of the bill.` (field `tendered`: `Must be at least ₹…`)
  - `Split payments were sent for a bill that isn't split.`
  - Unchanged from today:
    - `<Label> is no longer accepted at this shop. Pick another payment method.`
    - `The amount tendered is less than the bill total.`
- **Exact copy, till:**
  - The Split button reads `Split`. The auto line's tag is `the rest`, the cash field label is `Cash given`, and the add chips read `+ Card`, `+ Other`, and so on.
  - Status texts:
    - `Collect ₹100.00 more`
    - `₹50.00 too much`
    - `Enter an amount for UPI`
    - `Cash covers the whole bill. Tap Cash instead.`
    - `Cash given is less than ₹400.00`
    - `Fully paid`, with the detail `₹0.00 left`, or `Change ₹100.00` when cash given was entered
  - Price change:
    - the toast `Prices updated: Fish Burger, Fries`
    - the dialog button `Updating prices…` (disabled), then `Charge the new total`
    - the dialog text `The bill changed again. Check it and press Save.`
- **Exact copy, elsewhere:**
  - Sales card note: `A split bill is counted under each method it used.`
  - Receipt lines: `Paid: Cash`, `Cash given`, `Change`.
  - Bills CSV, last column `Payment details`, for example `Cash 400.00; UPI 100.00`.
  - Bill-payments CSV columns: `Date, Bill No, Method, Amount, Cash Given, Change, Bill ID`.
  - Backup toast: `Six files downloaded`.
- **UI:** use Ember tokens only. Till touch targets are at least 40px. The receipt stays monospace black-on-white.

## Review Focus

1. **The cashier types into the auto line, then changes the discount or the cart.** Expected: the typed line keeps its amount, and the status turns to "Collect … more" or "… too much" with Save locked. Pinned in Task 4 (`typed UPI does not follow a discount`).
2. **The owner switches off a method while a split is on screen.** Expected: after the refresh, that line disappears. If fewer than two lines are left, the till falls back to the default method. It never sends a disabled method. Pinned in Task 4 (`keepEnabledLines`) and Task 2 (the server refuses with CONFLICT).
3. **A ₹0 bill (100% discount).** Expected: Split is disabled, and a one-method ₹0 bill still saves with one ₹0.00 line. Pinned in Task 1 (the database accepts a ₹0 single line), Task 2 (the planner on total `0.00`) and Task 4 (`canSplit`).
4. **A blank or junk amount in a split row** (`""`, `"."`, `"1.005"`). Expected: the till reads it as ₹0 and shows "Enter an amount for …" or "Collect … more", and the server refuses any non-rupee string. Pinned in Task 2 (schema) and Task 4 (status).
5. **A price change where the menu reload also drops an item** (it sold out), so the bill never reaches the server's new total. Expected: the dialog never charges, and it says "The bill changed again". Pinned in Task 3 (`priceChangeStep` → `CHANGED_AGAIN`).

---

### Task 1: The payments table, its guarantees, and every money reader

**Files:**

- Modify:
  - `src/constants/payment-methods.ts`
  - `src/db/schema/enums.ts`, `src/db/schema/bills.ts`, `src/db/schema/shop-settings.ts`, `src/db/schema/index.ts`
  - `src/server/bills/create-bill-service.ts` (write the one line)
  - `src/server/reports/reports-queries.ts` (`getPaymentBreakdown`)
  - `src/server/expenses/expenses-queries.ts` (`getCashBook`)
  - `src/types/bill.types.ts`, `src/types/report.types.ts`
  - `src/components/custom/PaymentMethodLabel.tsx`
  - `src/components/pages/print/components/Receipt80mm.tsx` (label only)
- Create: `src/db/schema/bill-payments.ts`
- Migrations:
  - Generate `src/db/migrations/0008_*.sql` with `npm run db:generate`.
  - Create `src/db/migrations/0009_bill_payments_guards.sql`, plus its `_journal.json` entry (idx 9, tag `0009_bill_payments_guards`, `when` = 0008's + 1), added the same way as `0004` and `0006`.
- Scripts:
  - `scripts/verify-constraints.ts`, `scripts/verify-immutability.ts`
  - `scripts/verify-create-bill.ts`, `scripts/verify-report-queries.ts`
  - `scripts/reset-bills.ts`, `scripts/db-drop-all.ts`, `scripts/dump-json.ts`

**Interfaces:**

- Produces, in `payment-methods.ts`:
  - `SPLIT = "SPLIT" as const`
  - `type BillPaymentMethod = PaymentMethod | typeof SPLIT`
  - `BILL_PAYMENT_METHODS = [...PAYMENT_METHODS, SPLIT] as const`
  - `BILL_PAYMENT_METHOD_LABELS: Record<BillPaymentMethod, string>` (the four labels plus `SPLIT: "Split"`)
- Produces, `paymentMethodEnum`: `["CASH", "UPI", "CARD", "OTHER", "SPLIT"]`. Add a comment that SPLIT is a bill-level label only.
- Produces, `billPayments` (§6.3):
  - `method` is `paymentMethodEnum("method").$type<PaymentMethod>().notNull()`.
  - `amount`, `tendered` and `changeDue` use the `money` helper.
  - `position` is `smallint`.
  - The CHECKs and indexes are as in Global Constraints. The unique `(bill_id, method)` index also serves lookups by bill, so no separate `bill_id` index is needed. `bill_payments_tender_matches` is `(tendered IS NULL AND change_due IS NULL) OR (method = 'CASH' AND tendered >= amount AND change_due = tendered - amount)`.
  - Types: `BillPayment`, `NewBillPayment`.
- Produces:
  - `bills_split_has_no_tender`: `payment_method <> 'SPLIT' OR (tendered IS NULL AND change_due IS NULL)`
  - `shop_settings_no_split_method`: `NOT ('SPLIT' = ANY(payment_methods))`
- Produces, in `0009`:
  - `prevent_bill_payment_mutation()` raises the immutability message with `ERRCODE = 'restrict_violation'`.
  - `assert_bill_payments_balance(p_bill_id uuid)` enforces the three rules in §6.3, raising `bill_payments_balance: …` with `ERRCODE = 'check_violation'`:
    - the line sum equals the total
    - a SPLIT bill has ≥ 2 lines, all > 0
    - otherwise there is exactly 1 line, with the same `method`, and `tendered`/`change_due` `IS NOT DISTINCT FROM` the bill's
  - The two `check_bill_payments_on_*()` trigger functions call it with `NEW.id` or `NEW.bill_id` and `RETURN NULL`.
- Produces, types:
  - `ReceiptData.paymentMethod: BillPaymentMethod`
  - `BillLedgerRow.paymentMethod: BillPaymentMethod`
  - `PaymentMethodLabel` accepts `method: BillPaymentMethod`. `SPLIT` shows "Split" with a `bg-muted-foreground` dot.

- [ ] **Step 1: Branch and commit the docs.** Run `git checkout -b feature/split-payment`. Commit the spec and this plan as `docs: split payment design and plan`.
- [ ] **Step 2: Add the failing database checks.**
  - **`verify-constraints.ts`:**
    - Add a helper `billWithPayments({ number, method, total, tendered?, changeDue?, lines: Array<{ method, amount, tendered?, changeDue? }> }): SQL`. It builds one statement: `WITH b AS (INSERT INTO bills … RETURNING id) INSERT INTO bill_payments … SELECT … FROM b`. Positions are 1..n, the date is `'2026-01-01'`, and bill numbers run from 9010 up. One statement means one commit, so the deferred trigger sees the bill and its lines together.
    - Run the new cases only if `tableExists("bill_payments")`; otherwise record one FAIL. Each case below is an `expectViolation`:

      | Case                                                                    | Constraint                      |
      | ----------------------------------------------------------------------- | ------------------------------- |
      | a plain CASH ₹100 bill with no line                                     | `bill_payments_balance`         |
      | CASH ₹100 bill with a CASH ₹90 line                                     | `bill_payments_balance`         |
      | SPLIT ₹100 with only CASH ₹100                                          | `bill_payments_balance`         |
      | SPLIT ₹100 with CASH ₹100 + UPI ₹0                                      | `bill_payments_balance`         |
      | UPI ₹100 bill with a CASH ₹100 line                                     | `bill_payments_balance`         |
      | CASH ₹100 bill, tendered 200 / change 100, with an untendered CASH line | `bill_payments_balance`         |
      | a line with method `SPLIT` (random `bill_id`)                           | `bill_payments_not_split`       |
      | a UPI line with tendered 200 / change 100                               | `bill_payments_tender_matches`  |
      | a SPLIT ₹500 bill with tendered 600 / change 100                        | `bills_split_has_no_tender`     |
      | `UPDATE shop_settings SET payment_methods = '{CASH,SPLIT}'`             | `shop_settings_no_split_method` |

    - Two positive cases must be **accepted**:
      - SPLIT ₹500 with CASH ₹400 (tendered 500, change 100) and UPI ₹100
      - a ₹0.00 CASH bill (subtotal 10, discount 10) with one CASH ₹0.00 line
    - Cleanup disables `bill_payments_immutable` and `bills_no_delete`, deletes the probe lines and then the bills (`business_date = '2026-01-01' AND bill_number BETWEEN 9010 AND 9099`), and re-enables both.
  - **`verify-immutability.ts`:**
    - The setup CTE also inserts the probe bill's CASH ₹50.00 line, at position 1.
    - Add `expectRejection` for `"UPDATE on bill_payments"` and `"DELETE on bill_payments"`, each with `because` = `"bill_payments are immutable"`.
    - The existing "voiding a bill is permitted" check now runs on a bill that has a line.
    - Teardown disables `bill_payments_immutable` and deletes the lines before the bill.
  - **`verify-create-bill.ts`:** after the normal bill, add the check `"a one-method bill writes exactly one matching line"`. The bill's `bill_payments` rows must equal `[{ method: "CASH", amount: expectedTotal, tendered: "500.00", change_due: subtract("500.00", expectedTotal), position: 1 }]`, compared as strings.
  - **`verify-report-queries.ts`:** add the data audit. Each count must be 0:
    - `"every bill's payment lines add up to its total"`: bills whose `total` differs from `coalesce(sum(lines.amount), 0)`
    - `"every one-method bill has exactly one matching line"`: non-SPLIT bills that don't have exactly one line, or whose single line differs in method, amount, tendered or change (`IS DISTINCT FROM`)
- [ ] **Step 3: Run** `npm run db:verify`. Expected: one FAIL, "bill_payments table is missing".
- [ ] **Step 4: Write the schema and migrations.**
  - Add the schema files and constants above.
  - Run `npm run db:generate` and read the SQL. `ALTER TYPE "public"."payment_method" ADD VALUE 'SPLIT'` must be the **first** statement, ahead of every CHECK that mentions `'SPLIT'`; move it if not.
  - Hand-write `0009` in the style of `0004`:
    - `CREATE OR REPLACE FUNCTION` for all four functions.
    - Then **one `DO $$ … $$` block** that runs the backfill and then `DROP TRIGGER IF EXISTS` / `CREATE TRIGGER` for all three triggers, so it is all-or-nothing (§6.4).
    - The backfill is `INSERT INTO bill_payments (bill_id, method, amount, tendered, change_due, position, created_at) SELECT id, payment_method, total, tendered, change_due, 1, created_at FROM bills b WHERE NOT EXISTS (SELECT 1 FROM bill_payments p WHERE p.bill_id = b.id)`.
    - Both balance triggers are `CREATE CONSTRAINT TRIGGER … AFTER INSERT … DEFERRABLE INITIALLY DEFERRED FOR EACH ROW`.
- [ ] **Step 5: Make the app write and read the lines.**
  - **`createBill`:** inside the transaction, right after the `bills` insert, insert one line: `{ billId, method: input.paymentMethod, amount: total, tendered, changeDue, position: 1 }`. Task 2 replaces this with the planner's lines.
  - **`getPaymentBreakdown`:** `from(billPayments).innerJoin(bills, eq(bills.id, billPayments.billId))`, using the same `inRange`, grouped by `billPayments.method`. It selects `paymentMethod: billPayments.method`, `billCount: count(*)::int` and `net: coalesce(sum(billPayments.amount), 0)::text`, ordered by the sum, descending.
  - **`getCashBook`, bill side:** the same join, with `COMPLETED` and the date range, grouped by `bills.businessDate` and `billPayments.method`, summing `billPayments.amount`. Do not change `buildCashBookDays`.
  - Widen the two types. Point `PaymentMethodLabel` and `Receipt80mm` at `BILL_PAYMENT_METHOD_LABELS`.
  - Search `src/` and `scripts/` for `paymentMethod` and `payment_method` (§10.6). Nothing may still **sum money** grouped by `bills.payment_method`; displaying it or filtering by it is fine.
- [ ] **Step 6: Maintain the scripts.**
  - **`reset-bills.ts`:**
    - Disable and re-enable `bill_payments_immutable`.
    - Run `DELETE FROM bill_payments` before `DELETE FROM bills`.
    - Add `bill_payments_immutable` to the `pg_trigger` list, so it checks `triggers.length === 7`, and the message reads "All seven".
  - **`db-drop-all.ts`:** drop `bill_payments` before `bills`, and drop the four new functions.
  - **`dump-json.ts`:** add `"bill_payments"` after `"bill_items"`.
- [ ] **Step 7: Run** `npm run db:migrate && npm run db:verify && npm run db:verify-immutability && npm run verify:bill && npm run verify:stock && npm run verify:expenses && npm run verify:report-queries && npm run typecheck && npm run lint`. Expected: all PASS, and the existing checks are unchanged.
- [ ] **Step 8: Commit.** `feat(split-payment): bill_payments table, its guarantees and readers`

### Task 2: Saving split bills

**Files:**

- Create:
  - `src/lib/utils/bill-payments.ts`
  - `scripts/verify-split-payment.ts`
- Modify:
  - `src/lib/validation/bill-schema.ts`, `src/types/bill.types.ts`
  - `src/server/bills/create-bill-service.ts`
  - `scripts/verify-create-bill.ts`, `scripts/verify-report-queries.ts`
  - `package.json`: add `"verify:split-payment": "tsx scripts/verify-split-payment.ts"`, and append it to `verify:offline` after `verify:cash-book-utils`

**Interfaces:**

- Consumes: `SPLIT`, `BillPaymentMethod` and `billPayments` (Task 1).
- Produces, in `bill-payments.ts` (pure, no server imports):
  - `type SplitPaymentInput = { method: PaymentMethod; amount: string }`
  - `type PlannedPaymentLine = { method: PaymentMethod; amount: string; tendered: string | null; changeDue: string | null; position: number }`
  - `type PaymentPlan = { paymentMethod: BillPaymentMethod; tendered: string | null; changeDue: string | null; lines: PlannedPaymentLine[] }`
  - `MAX_SPLIT_LINES = PAYMENT_METHODS.length`
  - `planPayments(input: { paymentMethod: BillPaymentMethod; tendered: string | null; splitPayments?: SplitPaymentInput[] | null }, total: string, enabled: readonly PaymentMethod[]): ActionResult<PaymentPlan>`
- Produces, the wire:
  - `createBillSchema.paymentMethod` becomes `z.enum(BILL_PAYMENT_METHODS)`.
  - `splitPayments` is `z.array(z.object({ method: z.enum(PAYMENT_METHODS), amount: amount("Payment") })).max(MAX_SPLIT_LINES).nullish()`.
  - `CreateBillInput` gains `splitPayments?: SplitPaymentInput[] | null`, and its `paymentMethod` becomes `BillPaymentMethod`. A one-method payload is unchanged.

- [ ] **Step 1: Write `scripts/verify-split-payment.ts`.**
  - Use the `check(label, actual, expected)` helper from `verify-stock-utils.ts`. Unless a case says otherwise, `total = "500.00"` and all four methods are enabled.
  - **One-method bills (today's behaviour, unchanged):**
    - CASH, tendered `"600.00"` → ok:
      - bill: `{ paymentMethod: "CASH", tendered: "600.00", changeDue: "100.00" }`
      - lines: `[{ CASH, "500.00", "600.00", "100.00", 1 }]`
    - UPI, tendered `"600.00"` → bill tendered `null`, lines `[{ UPI, "500.00", null, null, 1 }]`
    - CASH, tendered `"499.99"` → VALIDATION, `The amount tendered is less than the bill total.`
    - CARD with enabled `[CASH, UPI]` → CONFLICT, `Card is no longer accepted at this shop. Pick another payment method.`
    - total `"0.00"`, CASH, tendered null → ok, lines `[{ CASH, "0.00", null, null, 1 }]`
    - a one-method bill that carries `splitPayments` → VALIDATION, `Split payments were sent for a bill that isn't split.`
  - **Split bills:**
    - CASH 400 + UPI 100, tendered null → ok:
      - `paymentMethod: "SPLIT"`, bill tendered/change `null`
      - lines `[{ CASH, "400.00", null, null, 1 }, { UPI, "100.00", null, null, 2 }]`
    - The same with tendered `"500.00"` → the CASH line has `"500.00"` / `"100.00"`.
    - The float trap: total `"110.80"`, lines CASH `"60.50"`, UPI `"40.30"`, CARD `"10.00"` → ok, three lines, positions 1–3.
  - **Split rejections:**
    - one line → `Choose at least two payment methods to split a bill.`
    - CASH twice → `Each payment method can be used only once on a bill.`
    - OTHER with enabled `[CASH, UPI, CARD]` → CONFLICT, `Other is no longer accepted…`
    - CASH 500 + UPI 0 → `Every split payment must be more than ₹0.`
    - 400 + 99.99, and 400 + 100.01 → `The payments don't add up to the bill total.`
    - UPI 400 + CARD 100 with tendered `"500.00"` → `Cash given needs a cash payment in the split.`
    - CASH 400 + UPI 100 with tendered `"399.99"` → `Cash given is less than the cash part of the bill.`
  - **`createBillSchema`:**
    - a one-method payload with no `splitPayments` parses
    - `paymentMethod: "SPLIT"` parses
    - a line with method `"SPLIT"` is rejected
    - a line amount given as the number `400` is rejected
    - a line amount of `"1.005"` is rejected
    - five lines are rejected
- [ ] **Step 2: Extend `verify-create-bill.ts`.** Use one line of `first` × 1, so `total = first.price`. Set `cash = subtract(total, "10.00")`, UPI `"10.00"`, and `tendered = add(cash, "5.00")`.
  - **`"a split bill saves"`:**
    - the bill row has `payment_method = 'SPLIT'` and `tendered` / `change_due` NULL
    - its lines are exactly CASH (`cash`, `tendered`, `"5.00"`, position 1) and UPI (`"10.00"`, NULL, NULL, position 2)
  - **`"a split retry returns the same bill"`:** the same key gives the same id, and the bill still has 2 lines.
  - **`"split lines that don't add up are rejected"`:** UPI `"9.99"` → VALIDATION.
  - **`"a disabled method in a split is rejected"`:** with `payment_methods = '{CASH,UPI}'`, a CASH + CARD split → CONFLICT. Restore the methods afterwards.
  - The existing "no bill numbers were burned" check, which runs after these, must still PASS.
- [ ] **Step 3: Extend `verify-report-queries.ts`.**
  - Read `getPaymentBreakdown(today, today)` and `getCashBook(today, today)`, where `today = stats.businessDate`.
  - Create the same CASH + UPI split through `createBill`, as the superadmin, with a fresh key. Then read both again.
  - Check:
    - **`"a split adds its cash part to Cash"`:** the CASH net delta equals `cash`.
    - **`"a split adds its UPI part to UPI"`:** the UPI net delta equals `"10.00"`.
    - **`"a split bill counts once in Net"`:** the breakdown total delta equals `total`.
    - **`"the Cash book splits it too"`:** the `moneyIn.cash` delta equals `cash`, and the `moneyIn.online` delta equals `"10.00"`.
- [ ] **Step 4: Run** `npm run verify:split-payment`. Expected: it fails to import `bill-payments`.
- [ ] **Step 5: Implement `planPayments`.**
  - **A one-method bill** does exactly what `createBill` does today: the enabled check, then the cash tender check (in that order). It yields one line with `amount = total`.
  - **A split** is checked in the order the copy is listed in Global Constraints: count, duplicates, enabled, > 0, sum, then cash given. Amounts go through `toAmount()`, and the sum through `add()`. Lines keep the input order. The cash line gets `tendered` and `changeDue`.
  - Replace the enabled and tendered block in `createBill` with `planPayments(input, total, enabledMethods)`. On failure, return `fail(code, message, fields)`. Write the plan's bill-level fields and `plan.lines`.
- [ ] **Step 6: Run** `npm run verify:split-payment && npm run verify:bill && npm run verify:report-queries && npm run typecheck && npm run lint`. Expected: all PASS.
- [ ] **Step 7: Commit.** `feat(split-payment): validate and save split bills`

### Task 3: Fix the price-change step for every bill (§9.4)

**Files:**

- Create: `src/components/pages/bill/utils/price-change.ts`
- Modify:
  - `src/components/pages/bill/utils/cart.ts`
  - `src/components/pages/bill/hooks/useCartReducer.ts`, `src/components/pages/bill/hooks/useBillPage.ts`
  - `src/components/pages/bill/components/PriceChangedDialog.tsx`, `src/components/pages/bill/BillPage.tsx`
  - `src/server/bills/create-bill-service.ts`
  - `scripts/verify-stock-utils.ts`, `scripts/verify-create-bill.ts`

**Interfaces:**

- Produces:
  - `clampLinesToMenu(lines, menu): { lines: CartLine[]; changed: string[]; repriced: string[] }`
    - Every kept line takes `unitPrice: item.price`.
    - `repriced` names the kept lines where `compare(old, new) !== 0`.
    - `changed` keeps today's meaning (stock cuts and drops only).
  - `syncMenu(menu): { changed: string[]; repriced: string[] }`. It dispatches `SYNC_MENU` when either list is non-empty.
- Produces, in `price-change.ts`:
  - `type PendingPriceChange = { message: string; newTotal: string | null; menu: MenuCategory[] }`
  - `type PriceChangeStep = "UPDATING" | "READY" | "CHANGED_AGAIN"`
  - `priceChangeStep(pending: PendingPriceChange, menu: MenuCategory[], lines: CartLine[], discount: string): PriceChangeStep`. It works like this:
    - `"UPDATING"` while `menu === pending.menu`.
    - Otherwise it re-runs `clampLinesToMenu(lines, menu)` and `billTotal(…, discount)`.
    - `"READY"` when nothing was `changed` and the fresh total equals `newTotal`; `"CHANGED_AGAIN"` otherwise.
  - Computing from `menu` directly, not from the synced cart, avoids a one-render flash before the sync effect lands.
- Produces: `createBill` returns `fail("PRICE_CHANGED", message, { total })`.
- Produces: `PriceChangedDialog` props become `{ message: string | null; step: PriceChangeStep | null; onConfirm; onDismiss; isSaving }`.

- [ ] **Step 1: Add the failing checks.**
  - **`verify-stock-utils.ts`:**
    - Update every existing `clampLinesToMenu` and `SYNC_MENU` expectation to include `repriced: []`.
    - Add `"a fresh menu re-prices a line"`: a line at `"60.00"` and a menu item at `"70.00"` → that line's `unitPrice` is `"70.00"`, `repriced` is `["Coke"]` and `changed` is `[]`.
  - **`priceChangeStep`:**
    - the same menu reference → `UPDATING`
    - a new menu whose prices make the total equal `newTotal` → `READY`
    - a new menu where the item is sold out → `CHANGED_AGAIN`
    - `newTotal: null` → `CHANGED_AGAIN`
  - **`verify-create-bill.ts`:** the existing stale-total check also asserts `stale.error.fields?.total === first.price`.
- [ ] **Step 2: Run** `npm run verify:stock-utils && npm run verify:bill`. Expected: FAIL on the new checks.
- [ ] **Step 3: Implement it.**
  - **`useBillPage`:**
    - Hold `priceChange: PendingPriceChange | null`.
    - On `PRICE_CHANGED`, store the message, `newTotal = result.error.fields?.total ?? null` and the current `menu`, then call `router.refresh()`.
    - Expose `priceChangeStep`.
    - `confirmPriceChange` acts only on `READY`: it clears the dialog, then calls `submit(total)` with the same key.
    - Toast `repriced` lines (`Prices updated: …`) next to the existing stock toast.
  - **`PriceChangedDialog`:**
    - `UPDATING`: the disabled `Updating prices…` button.
    - `READY`: `Charge the new total`.
    - `CHANGED_AGAIN`: the extra sentence, and no confirm button.
- [ ] **Step 4: Run** `npm run verify:stock-utils && npm run verify:bill && npm run typecheck && npm run lint`. Expected: all PASS.
- [ ] **Step 5: Look at the screen.**
  1. Open a bill on the till.
  2. In another tab, as the owner, raise the price of an item that's on the bill.
  3. Press Save & Print. The dialog shows the new total, and the bill on screen re-prices.
  4. Press "Charge the new total". It saves at the new total.
  5. Repeat with the item marked sold out in the other tab. The dialog says the bill changed again and offers no confirm button.
- [ ] **Step 6: Commit.** `fix(till): a price change re-prices the bill and charges the new total`

### Task 4: The till's split maths (offline)

**Files:**

- Create: `src/components/pages/bill/utils/split-payment.ts`
- Modify: `scripts/verify-split-payment.ts`

**Interfaces:**

- Consumes: `SplitPaymentInput` (Task 2), and `money.ts`.
- Produces:
  - **Types:**
    - `type SplitLine = { method: PaymentMethod; amountInput: string; auto: boolean }`. At most one line is `auto`.
    - `type ResolvedSplitLine = { method: PaymentMethod; amount: string; auto: boolean }`
    - `type SplitStatus` is one of:
      - `{ kind: "PAID"; change: string | null }`
      - `{ kind: "SHORT"; amount: string }`
      - `{ kind: "OVER"; amount: string }`
      - `{ kind: "ZERO_LINE"; method: PaymentMethod }`
      - `{ kind: "SINGLE_METHOD"; method: PaymentMethod }`
      - `{ kind: "CASH_GIVEN_SHORT"; cashAmount: string }`
  - **`canSplit(enabled, total): boolean`:** at least 2 methods are enabled and the total is > 0.
  - **`startSplit(enabled): SplitLine[]`:** `[{ CASH or else enabled[0], "", false }, { the first other enabled method, "", true }]`.
  - **`resolveSplit(lines, total): ResolvedSplitLine[]`:**
    - a manual line is `parseRupeesOrZero(amountInput)`
    - the auto line is `max(0, total − sum(manual))`
  - **`typeSplitAmount(lines, method, value): SplitLine[]`:** sets `amountInput`, and that line's `auto` to `false`.
  - **`addSplitLine(lines, method, total): SplitLine[]`:** the old auto line freezes at its resolved amount as a manual line, and the new line is appended as the auto line.
  - **`removeSplitLine(lines, method): SplitLine[]`:** does nothing when 2 or fewer lines remain. If it removes the auto line, the last remaining line becomes auto, with its `amountInput` cleared.
  - **`methodsToAdd(lines, enabled): PaymentMethod[]`:** the enabled methods not yet on a line, in enabled order.
  - **`keepEnabledLines(lines, enabled): SplitLine[] | null`:** drops lines whose method is disabled. It returns `null` if fewer than 2 lines remain, and makes the last line auto if none is.
  - **`splitStatus(resolved, total, cashGivenInput): SplitStatus`:** checks in this order:
    1. OVER
    2. SHORT
    3. a zero line: SINGLE_METHOD when exactly one line is non-zero, otherwise ZERO_LINE for the first zero line
    4. CASH_GIVEN_SHORT, only when cash given is filled and there is a cash line
    5. PAID, with `change = given − cash`, or `null`
  - **`splitStatusText(status): { tone: "warning" | "success" | "destructive"; text: string; detail: string | null }`:** the copy in Global Constraints. OVER is `destructive`, PAID is `success`, and the rest are `warning`.
  - **`splitPayload(resolved): SplitPaymentInput[]`**

- [ ] **Step 1: Add the checks to `verify-split-payment.ts`.** All four methods are enabled and `total = "500.00"` unless stated.
  - **`canSplit`:**
    - `([CASH], "500.00")` → false
    - `([CASH, UPI], "0.00")` → false
    - `([CASH, UPI], "500.00")` → true
  - **`startSplit`:**
    - all four → `[{CASH,"",false},{UPI,"",true}]`
    - `[UPI, CARD]` → `[{UPI,"",false},{CARD,"",true}]`
    - `[CARD, CASH]` → `[{CASH,"",false},{CARD,"",true}]`
  - **Typing CASH `"400"`:**
    - resolves to CASH `400.00` and UPI `100.00` (auto)
    - status `PAID`, change `null`, text `Fully paid`, detail `₹0.00 left`
  - **`"the auto line follows a discount"`:** the same lines at total `"450.00"` → UPI `50.00`.
  - **`"typed UPI does not follow a discount"`:** type UPI `"100"`, then resolve at `"450.00"` → status `OVER 50.00`, text `₹50.00 too much`, tone `destructive`.
  - **Short:** CASH `"400"`, UPI typed `"50"` → `SHORT 50.00`, text `Collect ₹50.00 more`.
  - **Single method:** CASH `"500"` → UPI auto `0.00` → `SINGLE_METHOD CASH`, text `Cash covers the whole bill. Tap Cash instead.`
  - **Three lines:**
    - CASH `"300"`, then `addSplitLine(…, CARD, "500.00")` → UPI is manual `"200.00"` and CARD is auto `0.00` → `ZERO_LINE CARD`, text `Enter an amount for Card`
    - then type UPI `"150"` → CARD auto `50.00` → `PAID`
  - **`removeSplitLine`:**
    - with 2 lines → unchanged
    - removing the auto CARD from 3 lines → UPI becomes auto
  - **Cash given:**
    - CASH 400 / UPI 100 with given `"500"` → `PAID`, change `"100.00"`, detail `Change ₹100.00`
    - given `"399"` → `CASH_GIVEN_SHORT`, text `Cash given is less than ₹400.00`
  - **Blank and junk:** CASH `""` with UPI auto → `SINGLE_METHOD UPI`; CASH `"."` behaves the same.
  - **Float trap:** total `"110.80"`, CASH `"60.50"`, UPI typed `"40.30"`, CARD added → CARD auto exactly `"10.00"`, `PAID`.
  - **`keepEnabledLines`:**
    - `[CASH, UPI auto]` with enabled `[CASH]` → `null`
    - three lines with CARD disabled → two lines, the last one auto
  - **`methodsToAdd` and `splitPayload`:**
    - `methodsToAdd([CASH, UPI])` with all four enabled → `[CARD, OTHER]`
    - `splitPayload` → `[{ method: "CASH", amount: "400.00" }, { method: "UPI", amount: "100.00" }]`
- [ ] **Step 2: Run** `npm run verify:split-payment`. Expected: it fails to import `split-payment`.
- [ ] **Step 3: Implement `split-payment.ts`.** All arithmetic goes through `money.ts` (`add`, `subtract`, `compare`, `isZero`), and all display through `formatINR`. Labels come from `PAYMENT_METHOD_LABELS`.
- [ ] **Step 4: Run** `npm run verify:split-payment && npm run typecheck && npm run lint`. Expected: all PASS.
- [ ] **Step 5: Commit.** `feat(split-payment): the till's split maths`

### Task 5: The Split button on the till (Option A)

**Files:**

- Create:
  - `src/components/pages/bill/hooks/useSplitPayment.ts`
  - `src/components/pages/bill/components/SplitPaymentLines.tsx`
- Modify:
  - `src/components/pages/bill/hooks/useBillPage.ts`
  - `src/components/pages/bill/components/PaymentPanel.tsx`, `src/components/pages/bill/components/CartPanel.tsx`
  - `src/components/pages/bill/BillPage.tsx`

**Interfaces:**

- Consumes: everything in Task 4; `PriceChangeStep` and `confirmPriceChange` from Task 3; `SPLIT` and `BillPaymentMethod`.
- Produces, `useSplitPayment({ paymentMethods, total }): SplitPaymentState`:
  - **State:**
    - `lines: ResolvedSplitLine[]`, `status: SplitStatus`, `addable: PaymentMethod[]`
    - `cashGivenInput: string`, `hasCashLine: boolean`
    - `active: boolean`: true when the split has lines, and `keepEnabledLines` did not return `null`
  - **Actions:**
    - `start()`, `reset()`, `add(method)`, `remove(method)`
    - `setAmount(method, value)`, `setCashGiven(value)`
  - The raw `SplitLine[]` and the cash-given input live in `useState`. The resolved lines are derived during render through `keepEnabledLines` and then `resolveSplit`. Removing the cash line clears cash given.
- Produces, in `useBillPage`:
  - `selectedMethod: BillPaymentMethod`
  - `showSplit = paymentMethods.length >= 2`
  - `splitAvailable = canSplit(paymentMethods, total)`
  - `paymentMethod` is `SPLIT` only while `splitAvailable && split.active`. Otherwise it falls back exactly as today.
  - `setPaymentMethod(method: BillPaymentMethod)` calls `split.start()` for `SPLIT` and `split.reset()` for anything else.
  - Returns `showSplit`, `splitAvailable` and `split`.
- Produces, `PaymentPanel` props:
  - `paymentMethod: BillPaymentMethod`, `onPaymentMethodChange: (method: BillPaymentMethod) => void`
  - `showSplit`, `splitAvailable`, `split: SplitPaymentState`
  - Add `5: "grid-cols-5"` to `GRID_COLUMNS`.

- [ ] **Step 1: Wire the state.**
  - **`useBillPage`:**
    - `canSave` while splitting is the existing base conditions plus `split.status.kind === "PAID"`.
    - `submit` for a split sends `{ paymentMethod: SPLIT, tendered, splitPayments: splitPayload(split.lines) }`. `tendered` is `parseRupeesOrZero(cashGivenInput)` when the cash line exists and the field is filled, and `null` otherwise. The one-method payload is untouched.
    - `confirmPriceChange` on `READY` while splitting clears the dialog and **returns without submitting** (§9.4).
    - `resetForNextCustomer` also calls `split.reset()`.
- [ ] **Step 2: Build the UI.**
  - **`PaymentPanel`:**
    - When `showSplit`, render a **Split** button after the method buttons, using lucide `Split` and the same classes.
    - It is disabled when `!splitAvailable`, which keeps the row steady on an empty bill.
    - When splitting, render `SplitPaymentLines` in place of the Tendered / Change tiles.
  - **`SplitPaymentLines`:**
    - One row per line: the method icon and label, then a `MoneyInput`.
      - The auto line shows its resolved amount, with the `the rest` tag, and selects its text on focus so typing replaces it.
      - The ✕ button shows only when there are more than 2 lines.
    - `Cash given` sits under the cash line, with `Change ₹…` once it's filled.
    - `+ Method` chips come from `addable`.
    - The status bar uses `aria-live="polite"`, with tone classes `bg-warning-soft text-warning-ink`, `bg-success-soft text-success-ink` or `bg-destructive-soft text-destructive-ink`.
    - The first line's input takes focus when Split is tapped.
    - Every control is at least 40px tall.
  - Thread the new props through `CartPanel` and `BillPage`.
- [ ] **Step 3: Run** `npm run format && npm run typecheck && npm run lint && npm run verify:offline`. Expected: all PASS.
- [ ] **Step 4: Look at the screen.** Run `npm run dev` and check at 1920×1080, 1366×768 and 375px wide.
  - **The ₹500 bill:**
    1. Tap Split, type 400, and check that UPI shows 100.00 with "the rest".
    2. The status reads Fully paid. Enter cash given 500 and check that Change shows ₹100.00.
    3. Save & Print. The bill saves.
  - **Status states:** type into UPI, change the discount, and watch the status go to Collect / too much. Add Card, then remove it.
  - **Leaving a split:** tap Cash. The split is gone and the old tiles are back.
  - **Price change while splitting:** do it from another tab. After "Charge the new total", the split re-balances and nothing is saved until Save is pressed.
  - **A normal cash bill:** it looks and works exactly as before.
  - **Layout:** Save & Print stays on screen, and there is no horizontal scroll at 375px.
- [ ] **Step 5: Commit.** `feat(split-payment): Split button on the till`

### Task 6: Receipt, bill details and the Bills list

**Files:**

- Modify:
  - `src/types/bill.types.ts`, `src/types/report.types.ts`
  - `src/server/bills/bills-queries.ts`
  - `src/components/pages/print/components/Receipt80mm.tsx`
  - `src/components/pages/bills/bill-details/BillDetails.tsx`, `src/components/pages/bills/BillsColumns.tsx`
  - `src/components/pages/bills/components/BillsTableToolbar.tsx`
  - `src/components/custom/PaymentMethodLabel.tsx`
  - `src/app/(app)/bills/page.tsx`
  - `src/components/pages/administration/settings/components/ReceiptPreviewDialog.tsx`
  - `scripts/verify-report-queries.ts`

**Interfaces:**

- Produces, types:
  - `type ReceiptPayment = { method: PaymentMethod; amount: string; tendered: string | null; changeDue: string | null }`
  - `ReceiptData.payments: ReceiptPayment[]`, ordered by `position`
- Produces, the Bills list:
  - `BillLedgerRow.splitPayments: Array<{ method: PaymentMethod; amount: string }> | null`. It is `null` for a one-method row, and built with `json_agg(json_build_object('method', p.method, 'amount', p.amount::text) ORDER BY p.position)`.
  - `BillLedgerFilters.paymentMethod?: BillPaymentMethod`
  - In `listBills`, `SPLIT` filters on `bills.payment_method`. A real method matches any bill that has a line with that method: `exists(select 1 from bill_payments where bill_id = bills.id and method = …)`.
- Produces: `PaymentMethodLabel` gains an optional prop `splitPayments`. When it's set, the label shows one dot per method and the `title` `Cash ₹400.00 · UPI ₹100.00`.

- [ ] **Step 1: Add the failing checks to `verify-report-queries.ts`.** These use today's split bill from Task 2's script.
  - **`"the Split filter finds only split bills"`:** filter `listBills` by `SPLIT`; every row is `SPLIT`, and there is at least one.
  - **`"filtering by UPI finds split bills with a UPI line"`:** filter by UPI; the split bill is included.
  - **`"split rows carry their payments as strings"`:** every `splitPayments` amount matches `/^\d+\.\d{2}$/`, and they add up to the row total.
  - **`"the receipt lists a split bill's payments"`:** `getReceipt(splitId).payments` has two entries, in position order.
- [ ] **Step 2: Run** `npm run verify:report-queries`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - **Queries:** `getReceipt` reads the lines with `toAmount` on every amount. `listBills` gets the subquery and the filter.
  - **`Receipt80mm`:**
    - A one-method bill keeps today's two rows.
    - A split prints one `Paid: <Label>` row per line, then `Cash given` and `Change` from the cash line, if it has them.
  - **`BillDetails`:**
    - A split shows `Paid by: Split`, then one row per line (dot, label, amount), then Cash given and Change.
    - One-method bills are unchanged.
  - **Bills list:** `bills/page.tsx` parses `paymentMethod` against `BILL_PAYMENT_METHODS`. The toolbar adds a `Split` option after the four methods. `BillsColumns` passes `splitPayments`.
  - **Receipt preview:** the sample gets `payments: [{ method: "CASH", amount: "140.00", tendered: "200.00", changeDue: "60.00" }]`.
- [ ] **Step 4: Run** `npm run verify:report-queries && npm run typecheck && npm run lint`. Expected: all PASS.
- [ ] **Step 5: Look at the screen.**
  - Print the split bill at 80mm and 58mm. The labels fit at 58mm.
  - Open a cash bill's receipt. It is unchanged.
  - Check the Bills list: the row, the hover text, and the Split, Cash and UPI filters.
  - Check the split bill's details page.
- [ ] **Step 6: Commit.** `feat(split-payment): receipt, bill details and Bills list`

### Task 7: Sales note, backup export, docs and go-live

**Files:**

- Modify:
  - `src/server/reports/reports-queries.ts`
  - `src/app/(app)/reports/sales/page.tsx`
  - `src/components/pages/reports/sales/SalesReportTab.tsx`, `src/components/pages/reports/sales/components/PaymentBreakdownCard.tsx`
  - `src/server/reports/export-all-action.ts`
  - `src/components/pages/administration/settings/components/ExportAllCard.tsx`
  - `scripts/verify-report-queries.ts`
  - `CLAUDE.md`, `docs/deployment.md`

**Interfaces:**

- Produces:
  - `hasSplitBills(from: string, to: string): Promise<boolean>`. It checks for a completed `SPLIT` bill in range, inside `withConnectionRetry`.
  - `PaymentBreakdownCard` prop `showSplitNote: boolean`
  - `ExportBundle.billPayments: string`

- [ ] **Step 1: Add the check.** In `verify-report-queries.ts`: `"hasSplitBills sees today's split"` → `hasSplitBills(today, today) === true`.
- [ ] **Step 2: Implement it.**
  - **Sales page:** fetches `hasSplitBills` in its `Promise.all` and passes it through. The card shows the note in `text-xs text-muted-foreground` under its list.
  - **`exportAllDataAction`:**
    - Read every `bill_payments` row joined to `bills`, ordered by date, bill number and position.
    - Build the `billPayments` CSV with the Global columns.
    - Add `Payment details` as the bills CSV's last column, using `PAYMENT_METHOD_LABELS` and `csvAmount`.
  - **`ExportAllCard`:** downloads `bill-payments-<stamp>.csv` as well. It says "six CSV files" and lists "every payment", and the toast is `Six files downloaded`.
- [ ] **Step 3: Update the docs.**
  - **`CLAUDE.md`:**
    - Add the spec to the doc table.
    - Add `verify:split-payment` to the verify table ("split payment rules and the till's split maths (no DB)").
    - Add a non-negotiable: how a bill was paid lives in `bill_payments`, so never sum money by `bills.payment_method`.
  - **`docs/deployment.md`:** add the §6.4 go-live checklist under "Database migrations".
- [ ] **Step 4: Run** `npm run verify:all && npm run build`. Expected: all PASS.
- [ ] **Step 5: Look at the screen.**
  - **Sales report:** the breakdown card for today has the note. A range with no split bill has no note.
  - **Cash book:** today shows the split's cash and online parts.
  - **Backup:** download it and open both CSVs.
- [ ] **Step 6: Commit.** `feat(split-payment): sales note, backup export and docs`
