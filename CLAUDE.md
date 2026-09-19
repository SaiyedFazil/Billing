# Fast Food Billing — Project Conventions

**Spec:** `docs/superpowers/specs/2026-08-23-fastfood-billing-design.md`
**Plans:** `docs/superpowers/plans/`

A counter POS for a single-outlet fast food shop. Next.js 16 App Router,
Drizzle + Neon Postgres, Auth.js v5, deployed to Netlify on free tiers.

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
2. **Every server action AND every protected page starts with `requireUser()`
   or `requireSuperadmin()`.** `proxy.ts` only redirects — Server Actions are
   publicly callable endpoints, so the guard is the real access control.

   **A layout guard is not enough for pages.** Next.js renders layouts and
   pages *in parallel*, so a page that relies on its layout's
   `requireSuperadmin()` will still run its queries and stream the results into
   the RSC payload before the layout's error propagates. This was caught in
   testing: a cashier requesting `/administration/items` saw the "Not allowed"
   screen but received the entire menu with prices in the response body. Every
   page under `/administration` now calls the guard itself.
3. **The client never sends prices.** Bill payloads carry `{ itemId, quantity }`.
   The server re-reads every price from the database.
4. **Reports read `bill_items` snapshot columns.** Never join to `items` for a
   name or price — that would let a rename rewrite history.
5. **Never `DELETE` an item, category or user.** Set `is_active = false`.
6. **Inside `db.transaction`, only throw.** Returning from the callback commits.
   Any validation that can fail belongs *before* the transaction opens — see
   the structure of `create-bill-service.ts`.
7. **Drizzle uses `neon-serverless` with a `Pool`.** Never `neon-http` — it
   cannot do interactive transactions, which bill creation depends on.
8. **`db` is a lazy Proxy.** It connects on first property access, so importing
   it during `next build` needs no DATABASE_URL and opens no connection.

## Structure

`src/app/` is routing only — a `page.tsx` exports `metadata` and renders one
component from `src/components/pages/`. Page logic lives in
`hooks/use<Feature>Tab.ts`, not in the component. Table pages split into
`XTab.tsx`, `XColumns.tsx` and `hooks/useXTab.ts`.

`src/server/<domain>/` is the data layer: `*-actions.ts` (thin — guard,
validate, delegate, return an `ActionResult`), `*-queries.ts` (reads),
`*-service.ts` (logic).

`/print/[billId]` sits outside the `(app)` route group so it inherits the
providers-only root layout and renders with no navbar.

Conventions are modelled on `t-genius-user-frontend`.

## Naming

Components `PascalCase.tsx` · feature hooks `useItemsTab.ts` · global hooks
`use-debounce.ts` · `lib`/`server`/`db` files `kebab-case.ts` · types
`<domain>.types.ts`.

## Notable version facts

- **Next.js 16** — middleware is `src/proxy.ts`, not `middleware.ts`.
- **Tailwind v4** — no `tailwind.config.ts`; theme tokens live in `globals.css`.
- **Zod 4** — use `z.uuid()`, not the deprecated `z.string().uuid()`. Money
  crosses the wire as a validated decimal **string**; a JSON number would be an
  IEEE-754 double and reintroduce the float bug.
- **big.js** — `Big.RM` is set to `roundHalfUp` once, in `money.ts`. Do not
  reconfigure it elsewhere; it is global to the library.
- **`numeric` columns come back as strings** from the Neon driver. Pass them
  through `toAmount()` to normalise `"60.5"` to `"60.50"` before display.
- **Auth.js v5 beta** — the JWT type must be augmented on **`@auth/core/jwt`**
  as well as `next-auth/jwt`, or every token field types as `unknown`.

## Verification

There is no test framework — a deliberate client decision. Verify with these:

```bash
npm run verify:offline   # money math, retry logic, typecheck, lint (no DB)
npm run verify:all       # the above plus all database checks
```

Individually:

| Command | Proves |
|---|---|
| `verify:money` | exact rupee arithmetic and the shop-local midnight rollover |
| `verify:retry` | cold-start retry fires once, and never on a real error |
| `db:verify` | CHECK constraints reject impossible bills |
| `db:verify-immutability` | triggers reject history rewrites, but allow voiding |
| `verify:bill` | idempotency, price-change detection, gapless numbering |

Run `npm run verify:all` before every deploy.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
