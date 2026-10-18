# Stock Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-item stock counts that saving a bill deducts atomically, an owner-only Update stock dialog with an append-only history, and stock status shown on the Items page, the till and the Dashboard.

**Architecture:** Three columns on `items` plus an immutable `stock_movements` ledger. `createBill` locks the tracked item rows inside its existing transaction and throws to roll back on shortage, so bill numbering stays gapless. Pure helpers in `src/lib/utils/stock.ts` decide status, sellability and adjustment maths once, for server and client alike. UI reads those helpers through one `StockBadge` component.

**Tech Stack:** Next.js 16 App Router, Drizzle + Neon (`neon-serverless` Pool), Zod 4, Tailwind v4 + shadcn/ui (Ember tokens), tsx verify scripts (no test framework).

**Spec:** `docs/superpowers/specs/2026-10-18-stock-management-design.md`. Read it alongside this plan; § numbers below refer to it.

## Global Constraints

- Branch `feature/stock-management`. Commit each task separately, after `npm run typecheck` and `npm run lint` pass.
- Every new server action starts with `requireSuperadmin()` inside `guarded()`. Every new page fetch stays behind its page's own guard.
- Inside `db.transaction`, only throw. Every failure that can be detected early is checked before the transaction opens.
- Never `DELETE` a `stock_movements` row. Its immutability trigger rejects `UPDATE` and `DELETE`.
- Stock is a whole-unit `integer`. `MAX_STOCK = 99_999`. `DEFAULT_LOW_STOCK_THRESHOLD = 10`. Note max 200 chars.
- Existing items migrate as `track_stock = false`. Untracked items must behave exactly as today.
- The seed stays untracked (`verify-create-bill.ts` bills the first item of the first and last category).
- Colours come from tokens: `success|warning|destructive` with `-soft`/`-ink`. No new hex.
- Exact copy (spec §7.2, §7.4, §8.2):
  - `"<name>" is out of stock. Remove it from the bill.`
  - `Only <n> "<name>" left. Reduce the quantity.`
  - `"<name>" just sold out. Remove it from the bill.`
  - `Only <n> in stock`
  - `That's already the count`
  - `Stock changed while you were editing. <n> are left now.`
- After every new shadcn component: `npm run format`, then restyle it to the tokens.

## Review Focus

1. **A stale cart after a refresh.** The cart holds 5 Coke, the save fails with OUT_OF_STOCK, and the refreshed menu says 3 left. Expected: the line drops to 3 (or is removed at 0), with a toast, so the cashier never re-submits a doomed bill. Pinned in Task 2 (`clampLinesToMenu`) and wired in Task 7.
2. **Tracking switched off, or the item marked Sold out, between validation and the write.** Expected: switched off means the sale goes through with no deduction and no SALE row, not a false "just sold out". Pinned in Task 3 (lock-then-check, test "tracking switched off mid-flight").
3. **Junk quantity input in the dialogs** (`""`, `"-5"`, `"1.5"`, `"1e3"`, `" 7 "`, `"100000"`). Expected: an inline error and no submit. `" 7 "` is accepted as 7. Pinned in Task 2 (`parseWholeQuantity`).
4. **An Add that pushes the count past 99,999.** Expected: rejected with a message, not a database error. Pinned in Task 2 (`planAdjustment`).
5. **An item that is both Sold out and at zero stock.** Expected: it shows **Sold out** (the owner's manual switch wins), and a threshold of 0 never shows Low. Pinned in Task 2 (`sellability`, `stockStatus`).

---

### Task 1: Schema, migrations and database guarantees

**Files:**

- Modify: `src/db/schema/items.ts`, `src/db/schema/enums.ts`, `src/db/schema/index.ts`
- Create: `src/db/schema/stock-movements.ts`, `src/db/transaction.ts`
- Modify: `src/server/items/item-order-service.ts:7` (import the shared `Transaction` type instead of declaring it)
- Generate: `src/db/migrations/0003_*.sql` (`npm run db:generate`)
- Create: `src/db/migrations/0004_stock_movements_immutable.sql` + a `_journal.json` entry (idx 4, tag `0004_stock_movements_immutable`, `when` = 0003's + 1), the same way `0001` was added
- Modify: `scripts/verify-constraints.ts`, `scripts/verify-immutability.ts`, `scripts/reset-bills.ts`, `scripts/db-drop-all.ts`

**Interfaces:**

- Produces: `items.trackStock` / `stockQuantity` / `lowStockThreshold` (columns `track_stock` bool default false, `stock_quantity` int default 0, `low_stock_threshold` int default 10, all NOT NULL); CHECKs `items_stock_non_negative`, `items_low_stock_threshold_non_negative`.
- Produces: `stockMovementTypeEnum = pgEnum("stock_movement_type", ["OPENING","RESTOCK","SALE","WASTAGE","CORRECTION"])`, the `stockMovements` table exactly as spec §6.2 (FKs `restrict`), CHECKs `stock_movements_bill_iff_sale` (`(bill_id IS NOT NULL) = (type = 'SALE')`), `stock_movements_delta_non_zero` (`quantity_delta <> 0 OR type = 'OPENING'`), `stock_movements_after_non_negative`, `stock_movements_note_length` (`note IS NULL OR char_length(note) <= 200`); indexes `stock_movements_item_created_idx (item_id, created_at desc)` and `stock_movements_bill_idx (bill_id)`; types `StockMovement`, `NewStockMovement`.
- Produces: `export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]` in `src/db/transaction.ts` (type-only import of `db`).
- Produces: trigger `stock_movements_immutable` on function `prevent_stock_movement_mutation()`, `ERRCODE = 'restrict_violation'`.

- [ ] **Step 1: Add the failing checks.** In `verify-constraints.ts`, add `expectRejection` cases:
  - `"negative stock_quantity"`: `UPDATE items SET stock_quantity = -1` on a probe item.
  - `"negative low_stock_threshold"`.
  - `"SALE movement without a bill"`.
  - `"RESTOCK movement with a bill"`.
  - `"zero-delta RESTOCK"`.
  - `"note over 200 chars"`.

  Also add a positive check that a zero-delta `OPENING` insert **succeeds**. In `verify-immutability.ts`, insert one `OPENING` movement for its probe item and add `"UPDATE on stock_movements"` and `"DELETE on stock_movements"` rejections. Its cleanup disables `stock_movements_immutable`, deletes the probe's movements before the probe item, then re-enables the trigger, mirroring the `bill_items` handling at lines 80-86.

- [ ] **Step 2: Run** `npm run db:verify` and `npm run db:verify-immutability`. Expected: they crash or FAIL on the missing column or table.
- [ ] **Step 3: Write the schema files and `src/db/transaction.ts`.** Export the new table from `schema/index.ts`. Run `npm run db:generate`, read the generated SQL, then hand-write `0004` in the style of `0001` (a `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS`, then `CREATE TRIGGER … BEFORE UPDATE OR DELETE … FOR EACH ROW`).
- [ ] **Step 4: Maintain the scripts.**
  - `reset-bills.ts`: disable `stock_movements_immutable` alongside the others, `DELETE FROM stock_movements` first, then `UPDATE items SET track_stock = false, stock_quantity = 0`, re-enable the trigger, and add `stock_movements_immutable` to the `pg_trigger` confirmation query.
  - `db-drop-all.ts`: drop `stock_movements` (before `bills` and `items`), the function `prevent_stock_movement_mutation`, and the type `stock_movement_type`.
- [ ] **Step 5: Run** `npm run db:migrate && npm run db:verify && npm run db:verify-immutability && npm run verify:bill && npm run verify:items`. Expected: all PASS, and the existing checks are unchanged.
- [ ] **Step 6: Commit.** `feat(stock): stock columns, movement ledger and its guarantees`

### Task 2: Pure stock helpers (offline-verified)

**Files:**

- Create: `src/lib/utils/stock.ts`, `src/lib/validation/stock-schema.ts`, `scripts/verify-stock-utils.ts`
- Modify: `src/components/pages/bill/utils/cart.ts` (add `clampLinesToMenu`), `src/types/bill.types.ts` (`CartLine.maxQuantity: number`), `src/types/item.types.ts`, `src/server/items/items-queries.ts` (`getMenu`), `src/components/pages/bill/hooks/useCartReducer.ts`
- Modify: `package.json` (`"verify:stock-utils": "tsx scripts/verify-stock-utils.ts"`, appended to `verify:offline` after `verify:reports`)

**Interfaces:**

- Produces, in `src/lib/utils/stock.ts`:
  - `MAX_STOCK = 99_999`, `DEFAULT_LOW_STOCK_THRESHOLD = 10`
  - `type StockLevel = { trackStock: boolean; stockQuantity: number; lowStockThreshold: number }`
  - `type StockStatus = "UNTRACKED" | "IN_STOCK" | "LOW" | "OUT"`, `stockStatus(level: StockLevel): StockStatus`
  - `type Sellability = "SELLABLE" | "SOLD_OUT" | "OUT_OF_STOCK"`, `sellability(item: StockLevel & { isAvailable: boolean }): Sellability`. `SOLD_OUT` wins over `OUT_OF_STOCK`.
  - `maxSellable(level: StockLevel): number`: untracked → `MAX_LINE_QUANTITY` (99); tracked → `min(99, stockQuantity)`
  - `parseWholeQuantity(input: string): number | null`: trims, accepts `/^\d+$/` up to `MAX_STOCK`, else `null`
  - `type AdjustMode = "ADD" | "REMOVE" | "SET"`, `type AdjustReason = "RESTOCK" | "WASTAGE" | "CORRECTION"`, `REASONS_FOR_MODE: Record<AdjustMode, AdjustReason[]>` (ADD → [RESTOCK]; REMOVE → [WASTAGE, CORRECTION]; SET → [CORRECTION])
  - `planAdjustment(current: number, mode: AdjustMode, quantity: number): { ok: true; after: number; delta: number } | { ok: false; message: string }`
- Produces, in `stock-schema.ts`: `adjustStockSchema` (`itemId: z.uuid()`, `mode`, `quantity: z.number().int().min(0).max(MAX_STOCK)`, `reason`, `note: z.string().trim().max(200).nullable()`, plus a `superRefine` that ADD/REMOVE need quantity ≥ 1 and the reason must be in `REASONS_FOR_MODE[mode]`). Also `type AdjustStockInput`.
- Produces, in `cart.ts`: `clampLinesToMenu(lines: CartLine[], menu: MenuCategory[]): { lines: CartLine[]; changed: string[] }`. Each line's `maxQuantity` is refreshed from the menu, and quantity is clamped to it. Lines whose item is now unsellable or missing are removed. `changed` holds the names that were affected.

- [ ] **Step 1: Write `scripts/verify-stock-utils.ts`** with the `check()` helper used by the other scripts, asserting:
  - `stockStatus`: untracked → `UNTRACKED`; 0 → `OUT`; 3 with threshold 10 → `LOW`; 10 with threshold 10 → `LOW`; 11 → `IN_STOCK`; 1 with threshold 0 → `IN_STOCK`; 0 with threshold 0 → `OUT`.
  - `sellability`: `{isAvailable:false, tracked, qty 0}` → `SOLD_OUT`; `{isAvailable:true, tracked, qty 0}` → `OUT_OF_STOCK`; untracked qty 0 → `SELLABLE`.
  - `maxSellable`: untracked → 99; tracked 3 → 3; tracked 500 → 99.
  - `parseWholeQuantity`: `""`, `"-5"`, `"1.5"`, `"1e3"`, `"100000"`, `"abc"` → `null`; `" 7 "` → 7; `"0"` → 0; `"99999"` → 99999.
  - `planAdjustment`:
    - (10, ADD, 5) → after 15, delta 5
    - (99_990, ADD, 10) → not ok, message `Stock can't go above 99,999`
    - (10, REMOVE, 11) → not ok, `Only 10 in stock`
    - (10, REMOVE, 10) → after 0, delta −10
    - (10, SET, 10) → not ok, `That's already the count`
    - (10, SET, 0) → after 0, delta −10
  - `adjustStockSchema`: rejects ADD with 0, REMOVE with reason RESTOCK, and a 201-char note. Accepts SET 0 CORRECTION.
  - `clampLinesToMenu`:
    - a 5-qty line whose item now has stock 3 → qty 3, `changed` = [name]
    - an item now at 0 → line removed
    - an untracked line → unchanged, `changed` empty
- [ ] **Step 2: Run** `npm run verify:stock-utils`. Expected: it fails to import.
- [ ] **Step 3: Implement the helpers.** `stock.ts` imports `MAX_LINE_QUANTITY` from `@/lib/validation/bill-schema` and must stay free of server imports, because the till bundles it.
- [ ] **Step 4: Fix what the new types break.** `MenuItem` (`src/types/item.types.ts`) gains `trackStock`, `stockQuantity` and `lowStockThreshold`, and `getMenu()` selects them. `useCartReducer`'s `ADD` sets `maxQuantity: maxSellable(action.item)`, which the new required `CartLine.maxQuantity` forces. The cap's behaviour comes in Task 7.
- [ ] **Step 5: Run** `npm run verify:stock-utils && npm run typecheck`. Expected: all PASS.
- [ ] **Step 6: Commit.** `feat(stock): status, sellability and adjustment helpers`

### Task 3: Bill creation deducts stock

**Files:**

- Create: `src/server/stock/stock-service.ts`, `scripts/verify-stock.ts`
- Modify: `src/server/bills/create-bill-service.ts`, `src/lib/utils/result.ts` (add `"OUT_OF_STOCK"` to `ErrorCode`)
- Modify: `package.json` (`"verify:stock": "tsx --env-file=.env.local scripts/verify-stock.ts"`, appended to `verify:all` after `verify:bill`)

**Interfaces:**

- Consumes: `Transaction` (Task 1), `stockMovements` (Task 1).
- Produces:
  - `class InsufficientStockError extends Error { constructor(readonly itemName: string, readonly available: number) }`
  - `deductStockForBill(tx: Transaction, args: { billId: string; userId: string; lines: Array<{ itemId: string; quantity: number }> }): Promise<void>`

- [ ] **Step 1: Write `scripts/verify-stock.ts`.** Setup, before anything else:
  - Create its own probe category `Stock Probe Category` and two probe items, `Stock Probe Tracked` (price 10.00, tracked, stock 5) and `Stock Probe Untracked`.
  - Use the superadmin as the user.
  - Clean up at the end with the trigger-bypass pattern from `verify-immutability.ts`. Delete movements, then the probe bills and bill_items, then the items and the category. Re-enable every trigger, even on failure (`finally`).

  Checks:
  - `"a sale deducts and writes a SALE movement"`: bill 2 → stock 3, one SALE row with delta −2, after 3, and `bill_id` = the bill.
  - `"an untracked item's bill is unaffected"`: no movement rows, `stock_quantity` unchanged.
  - `"selling more than in stock fails with OUT_OF_STOCK"`: qty 4 against 3. Code `OUT_OF_STOCK`, message `Only 3 "Stock Probe Tracked" left. Reduce the quantity.`, and **bill count, `bill_counters.last_number` for today, and movement count all unchanged**.
  - `"the same item on two lines is summed"`: lines 2 + 2 against 3 → OUT_OF_STOCK.
  - `"two concurrent bills for the last unit: exactly one succeeds"`: set stock 1, `Promise.all` two `createBill` calls with different keys. One ok, one OUT_OF_STOCK. Today's bill numbers have no gap (`max(bill_number) = count(*)` for the day). Stock is 0.
  - `"an idempotent retry does not deduct twice"`: the same key twice → the same bill id, one SALE row.
  - `"tracking switched off mid-flight sells without deducting"`: call `deductStockForBill` inside a `db.transaction` that first runs `UPDATE items SET track_stock = false`. No throw, no SALE row. Then roll back by throwing a sentinel error and catching it.
  - `"out of stock at zero"`: stock 0 → message `"Stock Probe Tracked" is out of stock. Remove it from the bill.`

- [ ] **Step 2: Run** `npm run verify:stock`. Expected: FAIL on the first deduction check.
- [ ] **Step 3: Implement `deductStockForBill`.**
  - Sum quantities per item id.
  - `SELECT id, name, track_stock, stock_quantity FROM items WHERE id IN (...) ORDER BY id FOR UPDATE` (Drizzle `.for("update")`). The ordered lock means two tills can't deadlock.
  - Skip untracked rows. Throw `InsufficientStockError` if `stock_quantity < qty`.
  - Otherwise update `stock_quantity` and `updated_at`, and insert the SALE movement.

  This lock-then-check replaces the spec §7.2 conditional `UPDATE`. It gives the same race guarantee and also handles Review Focus 2.

- [ ] **Step 4: Wire it into `createBill`.**
  - Validation phase: select `trackStock` and `stockQuantity`, sum per item, and return the two pre-transaction OUT_OF_STOCK messages.
  - Write phase: call `deductStockForBill(tx, { billId: bill.id, userId, lines: input.lines })` after the `billItems` insert.
  - `catch`: `InsufficientStockError` → `fail("OUT_OF_STOCK", '"<name>" just sold out. Remove it from the bill.')`.
  - Before **every** OUT_OF_STOCK return, call `findByIdempotencyKey(input.idempotencyKey)` and return `ok(existing)` if one is found (spec §7.2, Idempotency).
- [ ] **Step 5: Run** `npm run verify:stock && npm run verify:bill`. Expected: all PASS, and `verify:bill` is unchanged.
- [ ] **Step 6: Commit.** `feat(stock): saving a bill deducts tracked stock atomically`

### Task 4: Stock adjustment and tracking services and actions

**Files:**

- Modify: `src/server/stock/stock-service.ts`, `scripts/verify-stock.ts`, `src/constants/audit-actions.ts` (`STOCK_ADJUSTED`, label `"Stock adjusted"`)
- Create: `src/server/stock/stock-actions.ts`, `src/server/stock/stock-queries.ts`, `src/types/stock.types.ts`

**Interfaces:**

- Consumes: `planAdjustment`, `adjustStockSchema`, `AdjustStockInput` (Task 2).
- Produces, in the service:
  - `adjustStock(input: AdjustStockInput, userId: string): Promise<ActionResult<{ before: number; after: number }>>`. Pre-checks run before the transaction: missing or inactive → `NOT_FOUND "That item no longer exists."`; untracked → `CONFLICT "Turn on stock tracking for this item first."`; then `planAdjustment` on the unlocked value, failing with `VALIDATION` and `fields.quantity`. Inside the transaction: `FOR UPDATE`, re-plan on the locked value and throw `StockChangedError(current)` on failure, then update and insert the movement (type = `reason`). Outside: `StockChangedError` → `CONFLICT "Stock changed while you were editing. <n> are left now."`. On success, write the `STOCK_ADJUSTED` audit entry (`before: {stockQuantity}`, `after: {stockQuantity, mode, reason, note}`).
  - `applyTrackingChange(tx: Transaction, args: { itemId: string; userId: string; wasTracked: boolean; storedQuantity: number; trackStock: boolean; openingStock: number | null }): Promise<void>`. Untracked → tracked: set `stock_quantity = openingStock`, insert OPENING with delta `openingStock - storedQuantity` and after `openingStock`. Every other transition writes no movement. Throws if `openingStock === null` on that transition (the action pre-checks this, so it should never happen).
- Produces, in queries: `getStockHistory(itemId: string, limit = 10): Promise<StockMovementRow[]>` (newest first, joined to `users.name` and `bills.bill_number`), and `getStockAlerts(): Promise<StockAlerts>` (active tracked items only, one query; `items` sorted out first, then by `stock_quantity` ascending, then name, limited to 6; `low` and `out` are full counts; `trackedCount` is the total tracked).
- Produces, in `stock.types.ts`:
  - `StockMovementRow { id; type: StockMovementType; quantityDelta: number; quantityAfter: number; note: string | null; createdAt: string /* ISO */; createdByName: string; billNumber: number | null }`
  - `StockAlertRow { id; name; categoryName; imageUrl: string | null; stockQuantity: number; lowStockThreshold: number }`
  - `StockAlerts { trackedCount: number; low: number; out: number; items: StockAlertRow[] }`
  - `StockMovementType`
- Produces, in actions (`"use server"`, each `guarded` + `requireSuperadmin()` on its first line):
  - `adjustStockAction(payload: unknown)`: Zod parse → `fieldErrors` on failure → `adjustStock` → revalidate `ADMIN_ROUTES.items`, `"/bill"`, `REPORT_ROUTES.dashboard`
  - `getStockHistoryAction(payload: { itemId: string }): Promise<ActionResult<StockMovementRow[]>>`, which validates `itemId` with `z.uuid()`

- [ ] **Step 1: Extend `verify-stock.ts`.** Call the services directly; the scripts can't sign in, so the guard is checked in Step 4.
  - `"add writes a RESTOCK movement"`: 3 + 10 → 13.
  - `"remove below zero is rejected with the count"`: REMOVE 14 → `VALIDATION`, message contains `Only 13 in stock`.
  - `"set count writes a CORRECTION"`: SET 7 → delta −6.
  - `"set to the same count is refused"`.
  - `"an adjustment on an untracked item is refused"`.
  - `"turning tracking on records an OPENING movement"`: on the untracked probe, run `applyTrackingChange` in a transaction with opening 0. Expected: a zero-delta OPENING row and stock 0.
  - `"the stock invariant holds"`: for each probe item, `stock_quantity` = the latest movement's `quantity_after`.
  - `"history is newest first"`: from `getStockHistory`.
  - `"alerts list out of stock before low"`: from `getStockAlerts`.
- [ ] **Step 2: Run** `npm run verify:stock`. Expected: the new checks FAIL.
- [ ] **Step 3: Implement** the service functions, queries, types, actions and audit action.
- [ ] **Step 4: Check the guard and run.** Grep that every `export async function` in `stock-actions.ts` calls `requireSuperadmin()`. Then run `npm run verify:stock`. Expected: all PASS.
- [ ] **Step 5: Commit.** `feat(stock): owner stock adjustments with history`

### Task 5: Tracking in the item create/edit dialog

**Files:**

- Modify: `src/lib/validation/item-schema.ts`, `src/server/items/items-actions.ts`, `src/server/items/items-queries.ts` (`listItemsForAdmin` selects the three stock columns), `src/types/item.types.ts` (`AdminItemRow` gains `trackStock`, `stockQuantity`, `lowStockThreshold`), `src/components/pages/administration/items/hooks/useItemsTab.ts`, `src/components/pages/administration/items/create-update-item-dialog/CreateUpdateItemDialog.tsx`
- Create: `src/components/pages/administration/items/create-update-item-dialog/components/StockTrackingSection.tsx`

**Interfaces:**

- Consumes: `applyTrackingChange` (Task 4), `parseWholeQuantity`, `DEFAULT_LOW_STOCK_THRESHOLD`, `MAX_STOCK` (Task 2).
- Produces: `itemSchema` gains `trackStock: z.boolean()`, `lowStockThreshold: z.number().int().min(0).max(MAX_STOCK)` and `openingStock: z.number().int().min(0).max(MAX_STOCK).nullable()`. `ItemFormState` gains `trackStock: boolean`, `lowStockInput: string`, `openingStockInput: string`, `wasTracked: boolean` and `stockQuantity: number`.

- [ ] **Step 1: Update the actions.**
  - Destructure `openingStock` out of the parsed data before the `items` insert or update; it is not a column.
  - Before the transaction: if tracking is turning on (create with `trackStock`, or update where `!before.trackStock && trackStock`) and `openingStock === null`, return `VALIDATION` with `fields.openingStock = "Enter the count on the shelf"`.
  - The update action never writes `stock_quantity` from the form.
  - Call `applyTrackingChange` inside the existing transaction, after the insert or update.
  - Add `trackStock` and `lowStockThreshold` to the `ITEM_UPDATED` before/after. An item created with tracking on includes `openingStock` in its `ITEM_CREATED` `after`.
- [ ] **Step 2: Build `StockTrackingSection`.**
  - A **Track stock** `Switch`.
  - When on: **Low-stock alert at** (default `"10"`).
  - **Opening stock** only when `!wasTracked`.
  - Otherwise a read-only line, "In stock: 24 · change it with Update stock", using `StockBadge` once Task 6 lands. Until then, plain text.

  Inputs use `inputMode="numeric"`. The hook parses them with `parseWholeQuantity` and sets `fieldErrors.lowStockThreshold` / `fieldErrors.openingStock` (`"Enter a whole number"`) without submitting. The section sits below the Available switch, separated by a `Separator`.

- [ ] **Step 3: Verify.** Run `npm run typecheck && npm run lint && npm run verify:items && npm run verify:stock`. Expected: PASS. In the dev server (owner):
  - create a tracked item at 0 → it saves
  - turn tracking on for Coke Large with 24 → the history has OPENING
  - try saving with opening stock blank → field error
  - turn tracking off and on → asked for opening stock again
- [ ] **Step 4: Commit.** `feat(stock): choose which items track stock`

### Task 6: Update stock dialog and Items page display

**Files:**

- Create: `src/components/custom/StockBadge.tsx`
- Create: `src/components/pages/administration/items/update-stock-dialog/UpdateStockDialog.tsx`, `.../update-stock-dialog/hooks/useUpdateStockDialog.ts`, `.../update-stock-dialog/components/StockHistoryList.tsx`
- Create: `src/components/pages/administration/items/components/StockSummaryTiles.tsx`
- Modify: `ItemsColumns.tsx` (a `"Stock"` header after `"Price"`; a `PackagePlus` icon button before Edit with `aria-label="Update stock for <name>"`, disabled for untracked items with `title="Turn on stock tracking in Edit"`), `ItemsTab.tsx`, `components/ItemsTableToolbar.tsx`, `hooks/useItemsTab.ts`, `src/app/(app)/administration/items/page.tsx`

**Interfaces:**

- Consumes: `stockStatus`, `planAdjustment`, `REASONS_FOR_MODE`, `parseWholeQuantity` (Task 2); `adjustStockAction`, `getStockHistoryAction` (Task 4); `AdminItemRow` stock fields (Task 5).
- Produces: `StockBadge({ level }: { level: StockLevel })`, the single owner of the status → label/class map in spec §9.1:
  - IN_STOCK: `"24"`, `bg-success-soft text-success-ink`
  - LOW: `"3 · Low"`, `bg-warning-soft text-warning-ink`
  - OUT: `"Out of stock"`, `bg-destructive-soft text-destructive-ink`
  - UNTRACKED: `"—"`, `text-muted-foreground`

  All `tabular-nums`, using the same pill geometry as the category pill in `ItemsColumns.tsx`.

- Produces: `type StockFilter = "ALL" | "IN_STOCK" | "LOW" | "OUT" | "UNTRACKED"`, exported from `useItemsTab.ts`. The page reads `searchParams.stock` (`in`, `low`, `out`, `untracked`; anything else → `ALL`) and passes `initialStockFilter`.

- [ ] **Step 1: Add the `StockBadge` and the Stock column.** Check the column at desktop and phone widths in the dev server.
- [ ] **Step 2: Build `StockSummaryTiles`.**
  - Three buttons: In stock / Low stock / Out of stock, with counts of tracked rows.
  - Tone icons use the status tokens, matching `StatCard`'s icon style, compact.
  - `aria-pressed` shows the active filter, and a click on the active tile clears it.
  - Rendered between the toolbar and the table only when some row has `trackStock`.
- [ ] **Step 3: Add the Stock filter.** Add a **Stock** `Select` to the toolbar (All stock / In stock / Low / Out of stock / Not tracked), bound to the same state. `useItemsTab` filters on `stockStatus(row)`. When the filter changes, update the URL with `window.history.replaceState` (keeping other params; `ALL` removes `stock`) so no server round trip happens. The empty-state copy becomes "Try a different search term, category or stock filter."
- [ ] **Step 4: Build `UpdateStockDialog`.**
  - Header: tile, name, the current count in `font-heading tabular-nums`, and `StockBadge`.
  - Mode `Tabs`: Add stock / Remove stock / Set count.
  - Quantity input. A reason `Select`, hidden when the mode has a single reason. A note `Textarea` (200 max, with a counter).
  - A preview line, "24 → 48", built from `planAdjustment`. Its `message` is shown inline when it fails, and Submit is disabled then or when the input is empty or invalid.
  - `StockHistoryList`: loaded through `getStockHistoryAction` when the dialog opens, with a `Skeleton` while loading. OPENING rows read "Opening count: N"; SALE rows read "Bill #N"; the others show the signed delta coloured success (+) or destructive (−).

  On success: toast `"<name>: 24 → 48"`, close, `router.refresh()`. On `CONFLICT`: show the message and `router.refresh()`, keeping the dialog open so the new count appears. The state lives in `useUpdateStockDialog`.

- [ ] **Step 5: Verify.** Run `npm run typecheck && npm run lint && npm run format:check`. In the dev server, at desktop and phone widths:
  - add, remove and set each work
  - removing more than the count shows the inline error
  - with a second tab, a bill sells some stock while the dialog is open → the CONFLICT path
  - the tiles filter, and `?stock=low` deep-links
- [ ] **Step 6: Commit.** `feat(stock): update stock dialog and stock column`

### Task 7: The till shows and enforces stock

**Files:**

- Modify: `src/components/pages/bill/components/MenuItemCard.tsx`, `src/components/pages/bill/hooks/useCartReducer.ts`, `src/components/pages/bill/hooks/useBillPage.ts`, `src/components/pages/bill/components/CartLine.tsx`

**Interfaces:**

- Consumes: `sellability`, `stockStatus`, `maxSellable` (Task 2); `clampLinesToMenu` (Task 2); the `OUT_OF_STOCK` code (Task 3).
- Produces: `useCartReducer` gains a `SYNC_MENU` action, `syncMenu(menu: MenuCategory[]): string[]`, which returns the changed names from `clampLinesToMenu`.

- [ ] **Step 1: Update `MenuItemCard`.**
  - `disabled` = `sellability(item) !== "SELLABLE"`. The pill reads "Sold out" or "Out of stock" accordingly.
  - LOW shows a `bg-warning-soft text-warning-ink` pill, "3 left", in the same corner position.
  - When `quantity >= maxSellable(item)` and the item is tracked, the + affordance is hidden and the price row reads "No more in stock". The card stays clickable as a no-op, showing the toast below.
- [ ] **Step 2: Update the cart reducer.** `ADD` sets `maxQuantity: maxSellable(item)` and refuses past it. `SET_QUANTITY` clamps to `line.maxQuantity` (replacing the bare `MAX_LINE_QUANTITY`). When a cap stops an add, `useBillPage` shows `toast("Only 3 Coke Small in stock")`. `CartLine`'s + button is disabled at `line.maxQuantity`.
- [ ] **Step 3: Update `useBillPage`.**
  - On `OUT_OF_STOCK`: `setError(message)` and `router.refresh()`.
  - A `useEffect` on `menu` calls `syncMenu(menu)`. If names changed, it shows `toast.warning("Updated to current stock: <names>")`.
- [ ] **Step 4: Verify.** Run `npm run typecheck && npm run lint && npm run verify:stock-utils && npm run verify:bill`. In the dev server, at desktop and phone widths, with Coke Large tracked at 3:
  - the card shows "3 left"
  - the fourth tap is refused with the toast
  - set the stock to 1 in another tab, then save the 3 → error, the cart clamps to 1, and the toast appears
  - at 0 the card shows Out of stock
  - an untracked item is unchanged
- [ ] **Step 5: Commit.** `feat(stock): till shows stock and stops overselling`

### Task 8: Dashboard Stock alerts card

**Files:**

- Create: `src/components/pages/dashboard/components/StockAlertsCard.tsx`
- Modify: `src/app/(app)/dashboard/page.tsx`, `src/components/pages/dashboard/DashboardPage.tsx`

**Interfaces:**

- Consumes: `getStockAlerts` (Task 4), `StockBadge` (Task 6). `requireUser()`'s returned `role` decides `canManage = role === "SUPERADMIN"`.
- Produces: `StockAlertsCard({ alerts, canManage }: { alerts: StockAlerts; canManage: boolean })`.

- [ ] **Step 1: Build the card.**
  - Styled like `TopItemsCard`: section, header "Stock alerts", sub-line "4 low · 2 out".
  - Rows: tile, name, category, then `StockBadge`.
  - When `canManage`, a "View all" link to `` `${ADMIN_ROUTES.items}?stock=low` ``.
  - An empty state ("All stock levels are healthy", `PackageCheck` icon) when `trackedCount > 0` but `low + out = 0`.
- [ ] **Step 2: Place it in the layout.** The page fetches `getStockAlerts()` in the existing `Promise.all`. When `trackedCount === 0` the layout is exactly as today. Otherwise the second row becomes `lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]`, with Top items and Stock alerts stacked in the right column.
- [ ] **Step 3: Verify.** Run `npm run typecheck && npm run lint`. In the dev server, at desktop and phone widths, check as owner (link visible), as cashier (no link), and with nothing tracked (the dashboard is unchanged).
- [ ] **Step 4: Commit.** `feat(stock): stock alerts on the dashboard`

### Task 9: Backup export includes stock

**Files:**

- Modify: `src/server/reports/export-all-action.ts`, `src/components/pages/administration/settings/components/ExportAllCard.tsx`

**Interfaces:**

- Produces: `ExportBundle` gains `stockMovements: string`. The items CSV gains the columns `Tracked` (Yes/No), `In stock` and `Low-stock alert at`, appended after `Available`. The new CSV's columns are Date (ISO), Item, Type, Change, After, Bill No, By, Note.

- [ ] **Step 1: Extend the action and the card.** Add the queries and columns. `ExportAllCard` downloads the fourth file with the same naming pattern it uses for the other three.
- [ ] **Step 2: Verify.** Run `npm run typecheck && npm run lint`. In the dev server, export and open the four files. The bills and bill-lines CSVs are byte-for-byte the same shape as before.
- [ ] **Step 3: Commit.** `feat(stock): include stock in the backup export`

### Task 10: Documentation and full verification

**Files:**

- Modify: `CLAUDE.md` (the Verification table gains rows for `verify:stock` and `verify:stock-utils`; add a non-negotiable 9: stock changes only through `stock-service.ts`, always with a movement row), `docs/superpowers/specs/2026-08-23-fastfood-billing-design.md` §3 (strike "Inventory and stock tracking" with a pointer to the stock spec)

- [ ] **Step 1: Update the docs.**
- [ ] **Step 2: Run** `npm run verify:all && npm run build`. Expected: every check PASS and the build succeeds. Paste the tail of the output in the hand-off.
- [ ] **Step 3: Commit.** `docs(stock): document stock checks and rules`
