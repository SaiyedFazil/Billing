# Stock Management — Design

Date: 2026-10-18 · Status: draft for owner review

Adds per-item stock counts to the POS. It lifts the "Inventory and stock
tracking" non-goal from the product spec (§3) for **finished, countable
items only** (bottled drinks, packaged snacks). It is not ingredient or recipe
inventory.

## 1. Intent

The owner wants the system, not memory, to know how many of each countable
item are left. A sale reduces the count. A delivery increases it. When an
item reaches zero, the till stops selling it, so the count on screen always
matches the shelf. The owner can see at a glance what is running low.

Success means the till never sells something that isn't there, no bill is
lost or mis-numbered because of stock, and every change to a count can be
explained afterwards (who, when, why).

## 2. Goals

1. The owner chooses, per item, whether its stock is tracked.
2. Saving a bill deducts stock for tracked items **atomically with the bill**.
3. A tracked item at zero shows **Out of stock** on the Items page and the
   New bill screen, and **cannot be added to a bill**.
4. The till cannot put more of an item on a bill than is in stock.
5. The owner updates stock through an **Update stock** dialog on the Items
   page: add, remove, or set an exact count, always with a reason.
6. Every change to a count is recorded in an append-only stock history.
7. Stock levels are visible on the Items page (column, summary tiles, filter)
   and on the Dashboard (Stock alerts card).

## 3. Non-goals

- Ingredient / recipe / bill-of-materials inventory (a burger using a bun and
  a patty).
- Fractional units (kg, litres). Stock is **whole units only** (owner
  decision).
- Purchase orders, suppliers, cost price, stock valuation, margin reports.
- Multi-location stock.
- Reserving stock while a bill is still being built on the till. Stock is
  only taken when the bill is saved.
- Restoring stock on void. There is no void UI yet (product spec §3). When
  it's built, voiding a bill must return its tracked quantities through a
  `VOID_RETURN` stock movement. This is recorded here as a requirement for
  that future work.

## 4. Anti-goals (a failure even if it "works")

- Any change in behaviour for an item whose tracking is off. Untracked items
  must bill exactly as today.
- A stock problem that burns a bill number or leaves a gap in the
  sequence.
- A count that goes below zero, by race or otherwise.
- A stock count that changes with no history row explaining it.
- A cashier being able to change stock by calling a server action directly.
- Reports, receipts, the sales-report CSV, or the price-change flow behaving
  any differently. (The Settings backup export _does_ grow, see §11.)

## 5. Owner decisions

| Question                | Decision                                                                    |
| ----------------------- | --------------------------------------------------------------------------- |
| What happens at zero    | Out of stock on Items page and till; the item **cannot** be added to a bill |
| Who can update stock    | **Owner (SUPERADMIN) only**                                                 |
| Which items are tracked | Owner chooses per item; existing items can be either                        |
| Default low-stock level | **10**, editable per item                                                   |
| Unit                    | Whole units                                                                 |

## 6. Data model

### 6.1 `items`: three new columns

| Column                | Type      | Default | Notes                                               |
| --------------------- | --------- | ------- | --------------------------------------------------- |
| `track_stock`         | `boolean` | `false` | Off = behaves exactly as today                      |
| `stock_quantity`      | `integer` | `0`     | `CHECK (stock_quantity >= 0)`, last line of defence |
| `low_stock_threshold` | `integer` | `10`    | `CHECK (low_stock_threshold >= 0)`; 0 = never "Low" |

**Builder's call:** the migration adds these with defaults, so every existing
item starts **untracked**. Going live changes nothing until the owner turns
tracking on for an item. This meets the "do not affect anything else"
requirement.

`stock_quantity` is a plain integer. It is not money, so the decimal-string
rule doesn't apply. A JS `number` is fine on the wire, validated with
`z.number().int()`.

### 6.2 `stock_movements` (new, append-only)

| Column           | Type                       | Notes                                                     |
| ---------------- | -------------------------- | --------------------------------------------------------- |
| `id`             | `uuid` PK                  |                                                           |
| `item_id`        | `uuid` → `items` restrict  |                                                           |
| `type`           | enum `stock_movement_type` | see below                                                 |
| `quantity_delta` | `integer`                  | signed: `+24` restock, `-2` sale; non-zero except OPENING |
| `quantity_after` | `integer`, `>= 0`          | the count after this movement                             |
| `bill_id`        | `uuid` → `bills`, nullable | set for `SALE` (and future `VOID_RETURN`)                 |
| `note`           | `text`, nullable           | free text from the owner, max 200 chars                   |
| `created_by`     | `uuid` → `users` restrict  |                                                           |
| `created_at`     | `timestamptz` default now  |                                                           |

Enum `stock_movement_type`: `OPENING`, `RESTOCK`, `SALE`, `WASTAGE`,
`CORRECTION`. `VOID_RETURN` is added by the future void work, through its own
migration.

- `CHECK`: `bill_id IS NOT NULL` if and only if `type = 'SALE'`.
- `CHECK`: `quantity_delta <> 0 OR type = 'OPENING'`. **Builder's call:** an
  opening count of 0, or re-enabling tracking at the count that was kept,
  is a valid save with a zero delta. An `OPENING` row's delta is the new
  count minus the stored `stock_quantity`. `quantity_after` is the figure
  that matters, and the history UI shows OPENING rows as "Opening count: 30"
  rather than as a ±delta, so an old kept count never reads as a misleading
  jump.
- Index on `(item_id, created_at desc)` for an item's history, and on
  `bill_id`.
- **Immutability trigger**: a hand-written migration, like
  `0001_immutability_triggers.sql`, rejects `UPDATE` and `DELETE` on
  `stock_movements`. History is never rewritten. A mistake is fixed with a
  new `CORRECTION` movement.

Invariant: for a tracked item, `stock_quantity` equals the
`quantity_after` of its latest movement. Every write to `stock_quantity`
happens in the same transaction as its movement insert.

## 7. Selling: the till and bill creation

### 7.1 Definition of "sellable"

```
sellable = isActive && isAvailable && (!trackStock || stockQuantity > 0)
```

The existing **Available** switch stays as it is: a manual "sold out today"
for any item, tracked or not. Stock-out is automatic and separate. The two
labels are different so the owner can tell why an item is off:

- `isAvailable = false` → **Sold out** (as today)
- tracked and `stockQuantity = 0` → **Out of stock**

### 7.2 `createBill` (`src/server/bills/create-bill-service.ts`)

The existing structure (validation before the transaction, only throws
inside it) is kept.

**Validation phase** (before the transaction). Also read `trackStock` and
`stockQuantity`. Sum the requested quantity **per item id** (the payload could
repeat an item across lines). For each tracked item:

- `stockQuantity = 0` → `fail("OUT_OF_STOCK", '"Coke Small" is out of stock. Remove it from the bill.')`
- requested > `stockQuantity` →
  `fail("OUT_OF_STOCK", 'Only 3 "Coke Small" left. Reduce the quantity.')`

This produces the friendly messages. It doesn't prevent races. That is the
next step's job.

**Write phase** (inside the existing transaction, after the bill lines are
inserted). For each tracked item, **in ascending item-id order** (consistent
lock order, so two tills can't deadlock), run a conditional decrement:

```sql
UPDATE items
   SET stock_quantity = stock_quantity - $qty, updated_at = now()
 WHERE id = $id AND track_stock AND stock_quantity >= $qty
RETURNING stock_quantity
```

- No row returned → another till took the stock in the meantime (or tracking
  changed). **Throw** a typed `InsufficientStockError(itemName)`. The
  transaction rolls back, including the bill counter, so numbering stays
  gapless (product spec §6.7).
- Row returned → insert a `SALE` movement with `quantity_delta = -qty`,
  `quantity_after = returned value`, `bill_id`, `created_by = cashier`.

The outer `catch` turns `InsufficientStockError` into
`fail("OUT_OF_STOCK", '"Coke Small" just sold out. Remove it from the bill.')`.

**Idempotency.** A retry with the same key normally returns at step 1
before any stock is touched, so a retry can never deduct twice. One race
remains: a retry can pass step 1 while the original is still committing,
then see the stock the original just took. So **before returning any
OUT_OF_STOCK** (from the validation phase or from the catch), look up the
idempotency key again. If the original bill exists, return it with `ok`.

**Price-change interplay.** A `PRICE_CHANGED` failure happens before the
transaction, so no stock is touched. The cashier's re-submit goes through the
stock checks again.

### 7.3 New error code

Add `"OUT_OF_STOCK"` to `ErrorCode` in `src/lib/utils/result.ts`. On this
code the till keeps the cart, shows the message in the existing error slot,
and calls `router.refresh()` so the menu cards show current stock.

### 7.4 Till UI (`src/components/pages/bill/`)

- `MenuItem` gains `trackStock`, `stockQuantity`, `lowStockThreshold`
  (`getMenu()` selects them).
- `MenuItemCard`:
  - Out of stock: same greyed, disabled treatment as Sold out, with an
    **Out of stock** pill.
  - Tracked and low (`0 < qty <= threshold`): a small warning pill
    **"3 left"** (`bg-warning-soft text-warning-ink`), so the cashier knows
    before the customer asks.
  - Every unit of an item already on the bill: the + affordance is disabled
    and the card reads **"No more in stock"**.
- `useCartReducer`: `ADD` and `SET_QUANTITY` cap a tracked item's quantity at
  `min(MAX_LINE_QUANTITY, stockQuantity)`. When the cap is hit, the till shows
  a short toast: "Only 3 Coke Small in stock".
- The menu is a server-rendered snapshot taken when the page loads. It is a
  courtesy display. The server (§7.2) is the authority.

## 8. Managing stock (owner only)

### 8.1 Turning tracking on and off: the item create/edit dialog

A new **Stock** section in `CreateUpdateItemDialog`:

- **Track stock** switch.
- When on: **Low-stock alert at** (integer, default 10).
- When turning tracking on (new item, or an existing untracked one):
  **Opening stock** (integer ≥ 0, required). It's written as an `OPENING`
  movement, so the item doesn't go straight to "Out of stock" the moment it's
  tracked.
- When tracking is already on, the dialog shows the current count read-only,
  with a hint to use **Update stock**. The edit dialog never changes the
  count. Only the stock dialog and sales do, so every change has a history
  row.
- Turning tracking **off** keeps `stock_quantity` and the history but stops
  enforcing and displaying it. Turning it back on asks for an opening count
  again.

`createItemAction` / `updateItemAction` handle this inside their existing
transaction. The audit log entry already covers the item's before/after.

### 8.2 The Update stock dialog

Opened from a new row action on the Items table (a `PackagePlus` icon button
next to Edit). It's only enabled for tracked items. For untracked items the
tooltip reads "Turn on stock tracking in Edit".

Contents:

- Header: item name, tile, and the **current count** in large tabular
  figures with its status badge.
- Mode tabs: **Add stock** · **Remove stock** · **Set count**.
- **Quantity** (whole number; Add/Remove ≥ 1; Set ≥ 0; max 99,999).
- **Reason**:
  - Add → `RESTOCK` (fixed).
  - Remove → `WASTAGE` (damaged/expired) or `CORRECTION`.
  - Set count → `CORRECTION` (a physical count).
- **Note** (optional, 200 chars).
- A live preview: "24 → 48".
- Submit is disabled when nothing would change (Set to the current value,
  quantity empty).
- **Recent changes**: the item's last 10 movements (date, type, ±delta,
  after, by whom, note). **Builder's call:** a full history page is out of
  scope; this list covers "why is this number what it is?".

Server action `adjustStockAction` in `src/server/stock/stock-actions.ts`,
with logic in `stock-service.ts`:

1. `requireSuperadmin()`. Cashiers get `FORBIDDEN` (owner decision).
2. Validate with Zod (`stock-schema.ts`): `itemId: z.uuid()`, `mode`,
   `quantity` int, `reason`, `note`.
3. Before the transaction: the item exists, is active, and is tracked,
   otherwise `NOT_FOUND` / `CONFLICT`. Remove with quantity > current count
   → `VALIDATION` "Only 12 in stock". Set count equal to the current
   value → `VALIDATION` "That's already the count", refused before any write
   (the UI disables it too, but the action is a public endpoint).
4. Transaction: `SELECT … FOR UPDATE` on the item row, compute the new
   count from the **locked** value (a sale may have happened while the dialog
   was open), throw if it would go negative, update `items`, insert the
   movement. Add and Remove are relative, so they stay correct even when a
   sale lands between opening the dialog and saving. Set count is
   absolute by design, because it records a physical count.
5. A thrown negative-stock error maps to `CONFLICT` "Stock changed while
   you were editing. 10 are left now." The dialog refreshes its count.
6. Write an audit-log entry `STOCK_ADJUSTED` (before/after count, mode,
   reason) so stock changes appear on the existing Audit page.
7. `revalidatePath` the Items page, `/bill` and the Dashboard.

The dialog follows the existing pattern: state and handlers in a hook
(`useUpdateStockDialog.ts`), restyled shadcn primitives, Ember tokens,
`fieldErrors` mapping, and `sonner` toast on success ("Coke Small: 24 → 48").

## 9. Displaying stock

### 9.1 Stock status (one helper, used everywhere)

`src/lib/utils/stock-status.ts`:

```ts
type StockStatus = "UNTRACKED" | "IN_STOCK" | "LOW" | "OUT";
stockStatus({ trackStock, stockQuantity, lowStockThreshold }): StockStatus
```

- `OUT`: tracked, `qty = 0`
- `LOW`: tracked, `0 < qty <= threshold`
- `IN_STOCK`: tracked, `qty > threshold`

Plus `STOCK_STATUS_STYLE`, one map from status to label and token classes, so
the Items page, till and Dashboard can't drift apart:

| Status    | Badge                                                     |
| --------- | --------------------------------------------------------- |
| In stock  | `bg-success-soft text-success-ink` "24"                   |
| Low       | `bg-warning-soft text-warning-ink` "3 · Low"              |
| Out       | `bg-destructive-soft text-destructive-ink` "Out of stock" |
| Untracked | `text-muted-foreground` "—"                               |

### 9.2 Items page

- New **Stock** column after Price: the badge above, `tabular-nums`.
- Above the table, a row of three compact tiles: **In stock · Low stock ·
  Out of stock**, each with its count of active tracked items. Clicking a
  tile filters the table to that status, and clicking it again clears the
  filter.
- The toolbar gains a **Stock** filter select (All / In stock / Low / Out /
  Not tracked). It's kept in sync with the tiles and reflected in the URL
  (`?stock=low`), so the Dashboard can link straight to a filtered view.
- Tiles are hidden when no item is tracked, so the page looks exactly as
  today until stock is used.

### 9.3 Dashboard

A **Stock alerts** card in the second row, next to Top items (below it on
narrow screens):

- A header with two counts: "4 low · 2 out".
- A list of affected items, out-of-stock first, then lowest count first, up
  to 6 rows: tile, name, badge.
- For the owner: "View all" links to `/administration/items?stock=low`. For a
  cashier, the card is read-only, with no link (the Items page is owner-only).
- An empty state when tracked items exist but none need attention: "All
  stock levels are healthy". The card is hidden entirely when no item is
  tracked.
- New query `getStockAlerts()` in `src/server/stock/stock-queries.ts`.
  Only active, tracked items, one query.

## 10. Edge cases covered

| Case                                              | Behaviour                                                                        |
| ------------------------------------------------- | -------------------------------------------------------------------------------- |
| Two tills sell the last unit at the same instant  | Conditional `UPDATE` lets one win; the other gets OUT_OF_STOCK, no number burned |
| Same item on two lines of one payload             | Quantities summed per item before checking and deducting                         |
| Bill retried after a timeout                      | Idempotency short-circuit; stock not deducted twice                              |
| Price changed and stock ran out together          | PRICE_CHANGED first (nothing written); re-submit then checks stock               |
| Owner sets count while a sale lands               | Row lock serialises them; both history rows are correct                          |
| Owner removes more than is left                   | Rejected with the current count                                                  |
| Tracking turned on for an existing item           | Opening count required, so it doesn't instantly go out of stock                  |
| Tracking turned off                               | Item bills as untracked; count and history kept                                  |
| Item retired (`isActive = false`)                 | Excluded from tiles, filters and Dashboard alerts                                |
| Item marked Sold out while tracked with stock     | Shows Sold out; not sellable; count unchanged                                    |
| Threshold 0                                       | Never "Low"; still goes Out at zero                                              |
| Retry lands while the original bill is committing | Key re-checked before OUT_OF_STOCK; the original bill is returned                |
| Tracking turned on with opening stock 0           | Valid; OPENING row with zero delta; item shows Out of stock                      |
| Cashier calls `adjustStockAction` directly        | `requireSuperadmin()` → FORBIDDEN                                                |
| Anyone tries to edit or delete a movement row     | Trigger rejects it                                                               |
| Something attempts a negative `stock_quantity`    | CHECK constraint rejects it                                                      |
| Till menu is stale                                | Server re-checks; till refreshes on OUT_OF_STOCK                                 |

## 11. What does not change

- Reports, the sales-report CSV and dashboard sales figures read
  `bill_items` as today. Stock adds no joins to them.
- **Exception: the Settings → Export all data backup** (`export-all-action.ts`,
  the owner's monthly safety net per `docs/deployment.md`). **Builder's
  call:** a backup that silently omits stock would be a bug, so the items
  file gains `track_stock`, `stock_quantity` and `low_stock_threshold`
  columns, and `ExportBundle` gains a fourth file, `stock_movements`.
  Existing columns and files are unchanged.
- Receipt / print view.
- Bill numbering, idempotency, price-change dialog, payment methods.
- Untracked items in every screen. The only visible change for them is "—"
  in the new Stock column.
- Non-negotiables 1–8 in `CLAUDE.md` all still hold. Rule 5 (never delete)
  extends to `stock_movements`.

## 12. Verification

No test framework (client decision), so the new checks follow the existing
`scripts/verify-*.ts` pattern:

- **`verify:stock`** (new, database), wired into `verify:all`:
  - a sale deducts and writes a `SALE` movement with the right `quantity_after`
  - an untracked item's bill is unaffected
  - selling more than in stock fails with OUT_OF_STOCK and **no bill, no
    counter increment, no movement**
  - two concurrent bills for the last unit: exactly one succeeds, the
    numbering stays gapless
  - an idempotent retry doesn't deduct twice
  - add / remove / set adjustments write correct movements; remove below
    zero is rejected
  - `adjustStockAction` is rejected for a cashier
  - turning tracking on records an `OPENING` movement
- **`db:verify`**: extended. The CHECK constraints reject negative stock and
  a SALE movement without a bill.
- **`db:verify-immutability`**: extended. `stock_movements` rejects
  UPDATE and DELETE.
- Existing `verify:bill`, `verify:items`, `verify:report-queries` must pass
  **unchanged**, which proves untracked behaviour didn't move.
  `verify-create-bill.ts` bills the first menu item of each category, so the
  seed must leave those items untracked.
- Scripts that delete rows must learn about the new table:
  `scripts/reset-bills.ts` and the cleanup in
  `scripts/verify-immutability.ts` must clear `stock_movements` first (and
  reset tracked counts in `reset-bills`), because movement rows reference
  bills and items. The immutability trigger needs the same bypass those
  scripts already use for `bill_items`.
- UI check in the dev server at desktop and phone widths: Items page (column,
  tiles, filter, both dialogs), till (low, out and cap behaviour), Dashboard
  card as owner and as cashier.

## 13. Left to the builder

- Exact component split and file names within the conventions in `CLAUDE.md`.
- Icon choices, exact copy beyond what's quoted here.
- Whether the seed marks the Drinks items as tracked with sample counts.
- Delivery order. Suggested: schema + migration → bill deduction +
  `verify:stock` → stock dialog + action → item dialog tracking section →
  Items page display → till display → Dashboard card. Each is committed
  separately.
