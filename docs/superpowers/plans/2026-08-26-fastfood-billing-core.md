# Fast Food Billing — Core Implementation Plan (M0–M3)

> ## ⚠️ EXECUTED AND PARTLY SUPERSEDED
>
> This plan was executed in full on 2026-08-26. **Do not re-run it.** It is
> kept as the record of how M0–M3 were built.
>
> One decision changed afterwards: money was originally stored as **integer
> paise** and is now stored as **`numeric(10,2)` rupees**, with arithmetic in
> big.js. Identifiers throughout this document have been renamed to match
> (`total` rather than `totalPaise`), but some prose and code blocks still
> describe the integer approach.
>
> **Current sources of truth:** `src/lib/utils/money.ts`, `src/db/schema/`,
> `CLAUDE.md`, and §6 / §11.3 of the spec.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working counter POS — a cashier logs in, rings up items, applies a flat discount, takes payment, saves an immutable bill, and prints an 80mm thermal receipt.

**Architecture:** Next.js 15 App Router monolith. React Server Components for reads, Server Actions for writes, no REST layer. Drizzle ORM over Neon Postgres using the WebSocket Pool driver so bill creation runs in one real transaction. Auth.js v5 credentials with JWT sessions. Sales records are immutable by database trigger, not by convention.

**Tech Stack:** Next.js 15 · TypeScript (strict) · Tailwind CSS · shadcn/ui · Drizzle ORM · Neon Postgres · Auth.js v5 · Zod · bcrypt · Netlify

**Spec:** `docs/superpowers/specs/2026-08-23-fastfood-billing-design.md`

**Covers:** M0 (foundation), M1 (data layer), M2 (auth), M3 (billing + print).
**Not covered — see Plan 2:** M4 item management, M5 reports, M6 users/settings/audit UI, M7 polish and handover.

---

## Global Constraints

Every task's requirements implicitly include this section.

1. ~~**Money is `integer` paise.**~~ **SUPERSEDED:** money is now RUPEES as an exact decimal string (`"60.50"`), stored as `numeric(10,2)`, with arithmetic via big.js in `src/lib/utils/money.ts`. Floats remain banned — they fail the `bills_total_matches` CHECK constraint.
2. **No test framework.** Verification is manual, by running the exact commands each task specifies and confirming the stated expected output. Do not add Vitest, Jest, or Playwright.
3. **No git.** The user has not initialised a repository. Do not run `git init`, `git add`, or `git commit`. Each task boundary is a natural commit point if they add git later.
4. **Every server action begins with a guard.** `requireUser()` or `requireSuperadmin()` on the first line. Middleware is a redirect convenience, never access control.
5. **The client never sends prices.** Bill payloads carry `{ itemId, quantity }` only. The server re-reads prices from the database.
6. **Drizzle uses `drizzle-orm/neon-serverless` with a `Pool`** — never `neon-http`. Interactive transactions are required.
7. **Inside `db.transaction`, only throw.** Returning a value from the callback commits. Validation that can fail must happen *before* the transaction opens.
8. **Naming:** components `PascalCase.tsx` · feature hooks `useThingTab.ts` · global hooks `use-thing.ts` · `lib`/`server`/`db` files `kebab-case.ts` · types `<domain>.types.ts`.
9. **Path alias `@/*` → `src/*`.**
10. **TypeScript `strict: true`.** No `any` without a written justification comment.
11. **Timezone:** `Asia/Kolkata` default, read from `shop_settings.timezone`. Timestamps are `timestamptz`; `business_date` is computed in application code.

---

## File Structure

Files created by this plan, and what each owns. Structure follows spec §13.

**Configuration (Task 1–3)**
- `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `components.json` — project config
- `netlify.toml` — build + adapter config
- `.env.template`, `.gitignore` — env contract
- `drizzle.config.ts` — migration generation
- `src/db/index.ts` — the single Drizzle client, Neon Pool, module-scoped
- `src/db/with-connection-retry.ts` — one retry on cold-start connection failures (spec §11.4)

**Schema (Task 4–8)** — one file per table, all re-exported from `src/db/schema/index.ts`
- `enums.ts` · `users.ts` · `categories.ts` · `items.ts` · `bills.ts` · `bill-items.ts` · `bill-counters.ts` · `audit-log.ts` · `shop-settings.ts`
- `src/db/migrations/` — generated SQL plus one hand-written trigger migration
- `src/db/seed.ts` — first superadmin, settings row, sample menu

**Auth (Task 9–13)**
- `src/lib/auth/password.ts` — bcrypt hash/verify, nothing else
- `src/auth.config.ts` / `src/auth.ts` — Auth.js split (edge-safe config vs full config)
- `src/lib/auth/guard.ts` — `requireUser` / `requireSuperadmin`
- `src/middleware.ts` — redirect gate
- `src/server/users/login-attempts.ts` — lockout counter
- `src/server/audit/write-audit-log.ts` — audit writer
- `src/components/pages/login/` — login UI
- `src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `src/components/layout/` — shell

**Billing (Task 14–26)**
- `src/lib/utils/{money,dates,result}.ts` — pure helpers, no I/O
- `src/types/{bill,item}.types.ts`, `src/constants/` — shared shapes
- `src/lib/validation/bill-schema.ts` — the Zod contract
- `src/server/items/items-queries.ts` — menu read
- `src/server/bills/create-bill-service.ts` — the transaction, the heart of the app
- `src/server/bills/bills-actions.ts` — thin action wrapper
- `src/components/pages/bill/` — cart reducer, container hook, UI
- `src/components/pages/print/` — receipt rendering
- `src/hooks/use-online-status.ts`, `src/components/custom/OfflineBanner.tsx`
- `docs/printer-setup.md`

---

# M0 — Foundation

### Task 1: Scaffold the Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `postcss.config.mjs`, `components.json`, `.gitignore`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Create: `src/lib/utils/cn.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `cn(...inputs: ClassValue[]): string` from `@/lib/utils/cn` — used by every shadcn component. Path alias `@/*` resolving to `src/*`.

- [ ] **Step 1: Create the Next.js app**

Run in the project root (`Billing/`):

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

Answer `No` if asked to overwrite `docs/`. The `docs/` folder must survive.

- [ ] **Step 2: Verify the scaffold and that docs survived**

```bash
ls docs/superpowers/specs/
npm run dev
```

Expected: the spec file is still listed, and `http://localhost:3000` serves the Next.js starter page. Stop the dev server before continuing.

- [ ] **Step 3: Enforce strict TypeScript**

Confirm `tsconfig.json` contains `"strict": true` under `compilerOptions`. If `create-next-app` did not set it, add it. Also confirm the path alias:

```json
{
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  }
}
```

- [ ] **Step 4: Initialise shadcn/ui**

```bash
npx shadcn@latest init
```

Choose: Default style, Neutral base colour, CSS variables **yes**. This creates `components.json` and rewrites `src/app/globals.css` with the theme tokens.

- [ ] **Step 5: Add the shadcn components this plan uses**

```bash
npx shadcn@latest add button input label card dialog table badge sonner separator tabs scroll-area alert skeleton
```

- [ ] **Step 6: Move the `cn` helper to its spec location**

shadcn creates `src/lib/utils.ts`. Spec §13 puts it at `src/lib/utils/cn.ts`.

Create `src/lib/utils/cn.ts`:

```ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Create `src/lib/utils/index.ts`:

```ts
export * from "./cn";
```

Delete `src/lib/utils.ts`, then point `components.json` at the new location by setting `"utils": "@/lib/utils"` under `aliases`.

- [ ] **Step 7: Verify the build compiles**

```bash
npx tsc --noEmit
npm run build
```

Expected: both exit 0. If `tsc` reports unresolved `@/lib/utils`, a shadcn component still imports the deleted file — fix its import to `@/lib/utils`.

---

### Task 2: Netlify config, environment contract, first deploy

**Files:**
- Create: `netlify.toml`, `.env.template`, `.env.local`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Task 1's built app
- Produces: `process.env.DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` available at runtime. A live Netlify URL.

- [ ] **Step 1: Create a Neon project and capture the connection string**

At https://console.neon.tech create a project named `fastfood-billing`, region closest to the shop. Copy the **pooled** connection string (the one containing `-pooler`). It looks like:

```
postgresql://USER:PASSWORD@ep-xxx-pooler.REGION.aws.neon.tech/neondb?sslmode=require
```

While there, note the plan's stated **history retention window** — spec §16.1 requires confirming this. Write the actual value into `docs/deployment.md` in Task 26.

- [ ] **Step 2: Write `.env.template`**

```bash
# Database — Neon POOLED connection string (must contain "-pooler")
DATABASE_URL=

# Auth.js — generate with: npx auth secret
AUTH_SECRET=
AUTH_URL=http://localhost:3000

# ImageKit (used from M4 onward; leave blank until then)
IMAGEKIT_PRIVATE_KEY=
IMAGEKIT_PUBLIC_KEY=
IMAGEKIT_URL_ENDPOINT=
NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY=
NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT=

# Seed script only — used once, then remove the password
SEED_SUPERADMIN_USERNAME=owner
SEED_SUPERADMIN_PASSWORD=
SEED_SUPERADMIN_NAME=Shop Owner
```

- [ ] **Step 3: Create `.env.local` with real values**

Copy `.env.template` to `.env.local`, paste the Neon URL, and generate the auth secret:

```bash
npx auth secret
```

Set `SEED_SUPERADMIN_PASSWORD` to a real password of at least 8 characters.

- [ ] **Step 4: Confirm `.gitignore` excludes secrets**

`.gitignore` must contain `.env*.local` and `.env`. It must **not** exclude `.env.template`.

- [ ] **Step 5: Write `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"

[build.environment]
  NODE_VERSION = "20"
```

- [ ] **Step 6: Deploy the blank app**

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:import .env.local
netlify deploy --build --prod
```

- [ ] **Step 7: Verify the deployed URL serves the app**

Open the URL Netlify prints. Expected: the Next.js starter page renders over HTTPS.

Then set `AUTH_URL` to that deployed URL in Netlify's env vars (leave `.env.local` pointing at localhost):

```bash
netlify env:set AUTH_URL https://YOUR-SITE.netlify.app
```

**This is M0's gate: the pipeline works before any feature exists.**

---

### Task 3: Drizzle + Neon connection

**Files:**
- Create: `src/db/index.ts`, `drizzle.config.ts`, `src/db/schema/index.ts`
- Create: `scripts/db-ping.ts`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: `DATABASE_URL` from Task 2
- Produces:
  - `db` — the Drizzle client, imported everywhere as `import { db } from "@/db"`
  - `withConnectionRetry<T>(run: () => Promise<T>, delayMs?: number): Promise<T>` from `@/db/with-connection-retry`
  - Scripts: `npm run db:generate`, `db:migrate`, `db:studio`, `db:ping`, `db:seed`

- [ ] **Step 1: Install dependencies**

```bash
npm install drizzle-orm @neondatabase/serverless ws
npm install -D drizzle-kit tsx @types/ws dotenv
```

- [ ] **Step 2: Create an empty schema barrel**

`src/db/schema/index.ts`:

```ts
// Re-exports every table. Tasks 4-6 add to this file.
export {};
```

- [ ] **Step 3: Create the Drizzle client**

`src/db/index.ts`:

```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

// Neon's driver needs a WebSocket implementation. Node 22+ has a global one,
// but Netlify's runtime is not guaranteed to, so supply it explicitly.
if (typeof globalThis.WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.template to .env.local.");
}

// Reuse the pool across hot reloads in development so we do not exhaust
// Neon's connection limit on every file save.
const globalForDb = globalThis as unknown as { billingPool?: Pool };

const pool =
  globalForDb.billingPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (process.env.NODE_ENV !== "production") {
  globalForDb.billingPool = pool;
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
```

- [ ] **Step 4: Create `drizzle.config.ts`**

```ts
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
```

- [ ] **Step 5: Add npm scripts**

Add to `package.json` `"scripts"`:

```json
{
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "db:ping": "tsx --env-file=.env.local scripts/db-ping.ts",
  "db:seed": "tsx --env-file=.env.local src/db/seed.ts"
}
```

- [ ] **Step 6: Write the connection check**

`scripts/db-ping.ts`:

```ts
import { sql } from "drizzle-orm";

import { db } from "../src/db";

async function main() {
  const started = Date.now();
  const result = await db.execute(sql`select now() as now, version() as version`);
  const row = result.rows[0] as { now: string; version: string };

  console.log("Connected in", Date.now() - started, "ms");
  console.log("Server time:", row.now);
  console.log("Version:", row.version.split(",")[0]);
  process.exit(0);
}

main().catch((error) => {
  console.error("Database connection FAILED:", error);
  process.exit(1);
});
```

- [ ] **Step 7: Verify the connection**

```bash
npm run db:ping
```

Expected output shape:

```
Connected in 1240 ms
Server time: 2026-08-26T...
Version: PostgreSQL 17.x
```

A first-run time of 1–2 seconds is the cold start described in spec §11.4 — that is correct, not a fault. Run it a second time; it should drop under 300ms.

If it fails with `getaddrinfo ENOTFOUND`, the connection string is wrong. If it hangs, you used the non-pooled URL — switch to the one containing `-pooler`.

- [ ] **Step 8: Add the cold-start retry**

Spec §11.4: Neon suspends idle databases, so the first query of the morning can fail outright rather than merely being slow. Retry **once**, and **only** for connection-class failures raised before any statement executed — never blindly re-run a failed transaction.

Create `src/db/with-connection-retry.ts`:

```ts
/**
 * Error codes that mean "the connection never opened", so nothing ran and
 * retrying cannot duplicate work. Anything else propagates untouched.
 */
const RETRYABLE = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "57P01", // admin_shutdown
  "57P03", // cannot_connect_now — Neon waking up
]);

function isConnectionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  return typeof code === "string" && RETRYABLE.has(code);
}

/**
 * Wrap a READ that opens its own connection. Do NOT wrap a transaction —
 * a partially-executed transaction must fail loudly, not silently re-run.
 */
export async function withConnectionRetry<T>(
  run: () => Promise<T>,
  delayMs = 400,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isConnectionFailure(error)) throw error;

    console.warn("Database connection failed; retrying once (cold start?)");
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return run();
  }
}
```

- [ ] **Step 9: Apply it to the menu and settings reads**

These two run on every billing-screen load and are the ones that meet a cold database first. Once Task 16 creates them, wrap their bodies:

```ts
// in src/server/items/items-queries.ts
export async function getMenu(): Promise<MenuCategory[]> {
  return withConnectionRetry(async () => {
    // …the existing query body…
  });
}
```

Do the same in `getShopSettings` and `getShopTimezone`. **Do not** wrap `createBill` — its transaction must fail loudly.

- [ ] **Step 10: Verify the retry path compiles and does not swallow real errors**

```bash
npx tsx --env-file=.env.local -e "
import { withConnectionRetry } from './src/db/with-connection-retry';
// A non-connection error must propagate on the first attempt.
let attempts = 0;
try {
  await withConnectionRetry(async () => { attempts++; throw Object.assign(new Error('bad sql'), { code: '42601' }); });
} catch (e) { console.log(attempts === 1 ? 'PASS — real errors are not retried' : 'FAIL — retried a non-connection error'); }
// A connection error must be retried exactly once (two attempts total).
attempts = 0;
try {
  await withConnectionRetry(async () => { attempts++; throw Object.assign(new Error('down'), { code: 'ECONNRESET' }); }, 10);
} catch (e) { console.log(attempts === 2 ? 'PASS — connection errors retried once' : 'FAIL — wrong attempt count: ' + attempts); }
process.exit(0);
"
```

Expected: two `PASS` lines.

---

# M1 — Data Layer

### Task 4: Schema part 1 — enums, users, categories, items

**Files:**
- Create: `src/db/schema/enums.ts`, `users.ts`, `categories.ts`, `items.ts`
- Modify: `src/db/schema/index.ts`

**Interfaces:**
- Consumes: `db` from Task 3
- Produces: table objects `users`, `categories`, `items`; enums `userRoleEnum`, `paymentMethodEnum`, `billStatusEnum`, `printerWidthEnum`. Inferred types `User = typeof users.$inferSelect`, `Item = typeof items.$inferSelect`.

- [ ] **Step 1: Create the enums**

`src/db/schema/enums.ts`:

```ts
import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "SUPERADMIN"]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "CASH",
  "UPI",
  "CARD",
  "OTHER",
]);
export const billStatusEnum = pgEnum("bill_status", ["COMPLETED", "VOID"]);
export const printerWidthEnum = pgEnum("printer_width", ["MM_80", "MM_58"]);
```

- [ ] **Step 2: Create the users table**

`src/db/schema/users.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { userRoleEnum } from "./enums";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    name: text("name").notNull(),
    role: userRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdBy: uuid("created_by").references((): AnyPgColumn => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Case-insensitive uniqueness: "Owner" and "owner" are the same login.
    uniqueIndex("users_username_lower_idx").on(sql`lower(${table.username})`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

- [ ] **Step 3: Create the categories table**

`src/db/schema/categories.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Only live categories must be uniquely named; retired ones may collide.
    uniqueIndex("categories_name_lower_idx")
      .on(sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
  ],
);

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
```

- [ ] **Step 4: Create the items table**

`src/db/schema/items.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { categories } from "./categories";
import { users } from "./users";

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    // Integer paise. Never a float. See spec §6 Principle 1.
    price: integer("price").notNull(),
    imageUrl: text("image_url"),
    imageFileId: text("image_file_id"),
    // Retired from the menu. Past bills still reference it.
    isActive: boolean("is_active").notNull().default(true),
    // Temporarily sold out.
    isAvailable: boolean("is_available").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("items_price_non_negative", sql`${table.price} >= 0`),
    index("items_category_active_idx")
      .on(table.categoryId)
      .where(sql`${table.isActive}`),
    uniqueIndex("items_category_name_lower_idx")
      .on(table.categoryId, sql`lower(${table.name})`)
      .where(sql`${table.isActive}`),
  ],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
```

- [ ] **Step 5: Export from the barrel**

`src/db/schema/index.ts`:

```ts
export * from "./enums";
export * from "./users";
export * from "./categories";
export * from "./items";
```

- [ ] **Step 6: Generate and apply the migration**

```bash
npm run db:generate
npm run db:migrate
```

Expected: `src/db/migrations/0000_*.sql` appears, and migrate reports success.

If `check` is not exported by your `drizzle-orm` version, upgrade: `npm install drizzle-orm@latest drizzle-kit@latest`. Do not silently drop the constraint.

- [ ] **Step 7: Verify the tables exist with the right constraints**

```bash
npm run db:studio
```

Open the printed URL. Expected: `users`, `categories`, `items` are listed with the columns above. Close studio.

---

### Task 5: Schema part 2 — bills, bill_items, bill_counters

**Files:**
- Create: `src/db/schema/bills.ts`, `bill-items.ts`, `bill-counters.ts`
- Modify: `src/db/schema/index.ts`

**Interfaces:**
- Consumes: `users`, `items`, `categories` from Task 4; enums
- Produces: tables `bills`, `billItems`, `billCounters`. Types `Bill`, `BillItem`.

- [ ] **Step 1: Create the bill counters table**

`src/db/schema/bill-counters.ts`:

```ts
import { date, integer, pgTable } from "drizzle-orm/pg-core";

/**
 * One row per business date. Incremented inside the same transaction as the
 * bill insert, so a rolled-back bill also rolls back its number — the
 * sequence is gapless. See spec §6.7.
 */
export const billCounters = pgTable("bill_counters", {
  businessDate: date("business_date").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});
```

- [ ] **Step 2: Create the bills table**

`src/db/schema/bills.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { billStatusEnum, paymentMethodEnum } from "./enums";
import { users } from "./users";

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billNumber: integer("bill_number").notNull(),
    // Shop-local date, computed in application code. See spec §6.11.
    businessDate: date("business_date").notNull(),

    subtotal: integer("subtotal").notNull(),
    // Flat rupee amount, never a percentage.
    discount: integer("discount").notNull().default(0),
    total: integer("total").notNull(),

    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    tendered: integer("tendered"),
    changeDue: integer("change_due"),

    status: billStatusEnum("status").notNull().default("COMPLETED"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => users.id),
    voidReason: text("void_reason"),

    // Double-submit protection. See spec §8.4.
    idempotencyKey: uuid("idempotency_key").notNull(),

    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("bills_date_number_idx").on(table.businessDate, table.billNumber),
    uniqueIndex("bills_idempotency_key_idx").on(table.idempotencyKey),

    check("bills_subtotal_non_negative", sql`${table.subtotal} >= 0`),
    check("bills_discount_non_negative", sql`${table.discount} >= 0`),
    check(
      "bills_discount_within_subtotal",
      sql`${table.discount} <= ${table.subtotal}`,
    ),
    check(
      "bills_total_matches",
      sql`${table.total} = ${table.subtotal} - ${table.discount}`,
    ),
    check(
      "bills_change_matches",
      sql`${table.tendered} IS NULL OR ${table.changeDue} = ${table.tendered} - ${table.total}`,
    ),

    index("bills_business_date_idx").on(table.businessDate),
    index("bills_created_at_idx").on(table.createdAt),
    index("bills_created_by_idx").on(table.createdBy),
    index("bills_payment_method_idx").on(table.paymentMethod),
  ],
);

export type Bill = typeof bills.$inferSelect;
export type NewBill = typeof bills.$inferInsert;
```

- [ ] **Step 3: Create the bill_items table**

`src/db/schema/bill-items.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { bills } from "./bills";
import { items } from "./items";

/**
 * Immutable snapshot of one sold line. itemName, categoryName and
 * unitPrice are COPIED at sale time — never join to `items` for these
 * values in a report. See spec §6 Principle 2.
 */
export const billItems = pgTable(
  "bill_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "restrict" }),
    // Link retained for analytics only, never for name or price.
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),

    itemName: text("item_name").notNull(),
    categoryName: text("category_name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotal: integer("line_total").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("bill_items_quantity_positive", sql`${table.quantity} > 0`),
    check("bill_items_unit_price_non_negative", sql`${table.unitPrice} >= 0`),
    check(
      "bill_items_line_total_matches",
      sql`${table.lineTotal} = ${table.unitPrice} * ${table.quantity}`,
    ),
    index("bill_items_bill_id_idx").on(table.billId),
    index("bill_items_item_id_idx").on(table.itemId),
  ],
);

export type BillItem = typeof billItems.$inferSelect;
export type NewBillItem = typeof billItems.$inferInsert;
```

- [ ] **Step 4: Export from the barrel**

Append to `src/db/schema/index.ts`:

```ts
export * from "./bill-counters";
export * from "./bills";
export * from "./bill-items";
```

- [ ] **Step 5: Generate and apply**

```bash
npm run db:generate
npm run db:migrate
```

- [ ] **Step 6: Verify the CHECK constraints actually reject bad data**

Create `scripts/verify-constraints.ts`:

```ts
import { sql } from "drizzle-orm";

import { db } from "../src/db";

async function expectRejection(label: string, statement: ReturnType<typeof sql>) {
  try {
    await db.execute(statement);
    console.error(`FAIL — ${label}: the database ACCEPTED invalid data`);
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`PASS — ${label}: rejected (${message.split("\n")[0]})`);
  }
}

async function main() {
  // Needs a user to satisfy the created_by foreign key.
  const user = await db.execute(sql`
    INSERT INTO users (username, password_hash, name, role)
    VALUES ('constraint-probe', 'x', 'Probe', 'ADMIN')
    ON CONFLICT DO NOTHING
    RETURNING id
  `);
  const userId =
    (user.rows[0] as { id: string } | undefined)?.id ??
    ((
      await db.execute(sql`SELECT id FROM users WHERE username = 'constraint-probe'`)
    ).rows[0] as { id: string }).id;

  await expectRejection(
    "total must equal subtotal minus discount",
    sql`INSERT INTO bills (bill_number, business_date, subtotal, discount,
        total, payment_method, idempotency_key, created_by)
        VALUES (9001, '2026-01-01', 10000, 1000, 9999, 'CASH', gen_random_uuid(), ${userId}::uuid)`,
  );

  await expectRejection(
    "discount cannot exceed subtotal",
    sql`INSERT INTO bills (bill_number, business_date, subtotal, discount,
        total, payment_method, idempotency_key, created_by)
        VALUES (9002, '2026-01-01', 10000, 20000, -10000, 'CASH', gen_random_uuid(), ${userId}::uuid)`,
  );

  await expectRejection(
    "change must equal tendered minus total",
    sql`INSERT INTO bills (bill_number, business_date, subtotal, discount,
        total, payment_method, tendered, change_due, idempotency_key, created_by)
        VALUES (9003, '2026-01-01', 10000, 0, 10000, 'CASH', 20000, 5000, gen_random_uuid(), ${userId}::uuid)`,
  );

  await db.execute(sql`DELETE FROM users WHERE username = 'constraint-probe'`);
  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json` scripts: `"db:verify": "tsx --env-file=.env.local scripts/verify-constraints.ts"`

```bash
npm run db:verify
```

Expected: three `PASS` lines, exit code 0. Any `FAIL` means a constraint did not make it into the migration — inspect `src/db/migrations/*.sql` for the missing `CHECK`.

---

### Task 6: Schema part 3 — audit_log and shop_settings

**Files:**
- Create: `src/db/schema/audit-log.ts`, `shop-settings.ts`
- Create: `src/constants/audit-actions.ts`
- Modify: `src/db/schema/index.ts`

**Interfaces:**
- Consumes: `users` from Task 4
- Produces: tables `auditLog`, `shopSettings`. Constant `AUDIT_ACTIONS` and type `AuditAction`.

- [ ] **Step 1: Create the audit action constants**

`src/constants/audit-actions.ts`:

```ts
export const AUDIT_ACTIONS = [
  "ITEM_CREATED",
  "ITEM_UPDATED",
  "ITEM_PRICE_CHANGED",
  "ITEM_DELETED",
  "CATEGORY_CREATED",
  "CATEGORY_UPDATED",
  "CATEGORY_DELETED",
  "USER_CREATED",
  "USER_UPDATED",
  "USER_DEACTIVATED",
  "USER_PASSWORD_RESET",
  "SETTINGS_UPDATED",
  "BILL_REPRINTED",
  "BILL_VOIDED",
  "LOGIN_FAILED",
  "LOGIN_LOCKED",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
```

- [ ] **Step 2: Create the audit log table**

`src/db/schema/audit-log.ts`:

```ts
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable: a failed login has no authenticated actor.
    actorId: uuid("actor_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_created_at_idx").on(table.createdAt),
    index("audit_log_actor_idx").on(table.actorId),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type NewAuditLogRow = typeof auditLog.$inferInsert;
```

- [ ] **Step 3: Create the shop settings singleton**

`src/db/schema/shop-settings.ts`:

```ts
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { printerWidthEnum } from "./enums";
import { users } from "./users";

/**
 * Exactly one row, enforced by a boolean primary key that must be true.
 */
export const shopSettings = pgTable(
  "shop_settings",
  {
    id: boolean("id").primaryKey().default(true),
    shopName: text("shop_name").notNull(),
    addressLine: text("address_line"),
    phone: text("phone"),
    logoUrl: text("logo_url"),
    logoFileId: text("logo_file_id"),
    receiptFooter: text("receipt_footer"),
    printerWidth: printerWidthEnum("printer_width").notNull().default("MM_80"),
    currencyCode: text("currency_code").notNull().default("INR"),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("shop_settings_singleton", sql`${table.id}`)],
);

export type ShopSettings = typeof shopSettings.$inferSelect;
```

- [ ] **Step 4: Export from the barrel**

Append to `src/db/schema/index.ts`:

```ts
export * from "./audit-log";
export * from "./shop-settings";
```

- [ ] **Step 5: Generate and apply**

```bash
npm run db:generate
npm run db:migrate
```

- [ ] **Step 6: Verify the singleton constraint holds**

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
await db.execute(sql\`INSERT INTO shop_settings (id, shop_name) VALUES (true, 'A')\`);
try {
  await db.execute(sql\`INSERT INTO shop_settings (id, shop_name) VALUES (false, 'B')\`);
  console.log('FAIL — a second settings row was accepted');
} catch (e) { console.log('PASS — singleton enforced'); }
await db.execute(sql\`DELETE FROM shop_settings\`);
process.exit(0);
"
```

Expected: `PASS — singleton enforced`.

---

### Task 7: Immutability triggers

**Files:**
- Create: `src/db/migrations/9999_immutability_triggers.sql`
- Create: `scripts/verify-immutability.ts`
- Modify: `package.json` (script)

**Interfaces:**
- Consumes: `bills`, `billItems` tables from Task 5
- Produces: three database triggers. No TypeScript surface — this is the enforcement layer beneath all application code.

- [ ] **Step 1: Write the trigger migration**

Drizzle Kit does not generate triggers, so this migration is hand-written. Create `src/db/migrations/9999_immutability_triggers.sql`. The `9999_` prefix keeps it last in lexical order.

```sql
-- Spec §6.10. The database itself refuses to rewrite sales history.

CREATE OR REPLACE FUNCTION prevent_bill_item_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bill_items are immutable: % is not permitted', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bill_items_immutable ON bill_items;
CREATE TRIGGER bill_items_immutable
  BEFORE UPDATE OR DELETE ON bill_items
  FOR EACH ROW EXECUTE FUNCTION prevent_bill_item_mutation();


CREATE OR REPLACE FUNCTION prevent_bill_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'bills cannot be deleted; void them instead'
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bills_no_delete ON bills;
CREATE TRIGGER bills_no_delete
  BEFORE DELETE ON bills
  FOR EACH ROW EXECUTE FUNCTION prevent_bill_delete();


-- Only the void columns may change. Everything else is frozen at insert.
CREATE OR REPLACE FUNCTION restrict_bill_update() RETURNS trigger AS $$
BEGIN
  IF (NEW.id, NEW.bill_number, NEW.business_date, NEW.subtotal,
      NEW.discount, NEW.total, NEW.payment_method,
      NEW.tendered, NEW.change_due, NEW.idempotency_key,
      NEW.created_by, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.bill_number, OLD.business_date, OLD.subtotal,
      OLD.discount, OLD.total, OLD.payment_method,
      OLD.tendered, OLD.change_due, OLD.idempotency_key,
      OLD.created_by, OLD.created_at)
  THEN
    RAISE EXCEPTION 'only status, voided_at, voided_by and void_reason may be updated on bills'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bills_restrict_update ON bills;
CREATE TRIGGER bills_restrict_update
  BEFORE UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION restrict_bill_update();
```

- [ ] **Step 2: Register the migration with Drizzle**

Open `src/db/migrations/meta/_journal.json` and append an entry to the `entries` array, incrementing `idx` past the highest existing value:

```json
{
  "idx": 3,
  "version": "7",
  "when": 1787000000000,
  "tag": "9999_immutability_triggers",
  "breakpoints": true
}
```

Match the `version` field to what the existing entries use.

- [ ] **Step 3: Apply**

```bash
npm run db:migrate
```

- [ ] **Step 4: Write the immutability check**

`scripts/verify-immutability.ts`:

```ts
import { sql } from "drizzle-orm";

import { db } from "../src/db";

async function expectRejection(label: string, statement: ReturnType<typeof sql>) {
  try {
    await db.execute(statement);
    console.error(`FAIL — ${label}: the database ACCEPTED the mutation`);
    process.exitCode = 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`PASS — ${label}: ${message.split("\n")[0]}`);
  }
}

async function main() {
  // Build one real bill to attack.
  const setup = await db.execute(sql`
    WITH u AS (
      INSERT INTO users (username, password_hash, name, role)
      VALUES ('immutability-probe', 'x', 'Probe', 'ADMIN') RETURNING id
    ), c AS (
      INSERT INTO categories (name) VALUES ('Probe Category') RETURNING id
    ), i AS (
      INSERT INTO items (category_id, name, price)
      SELECT c.id, 'Probe Item', 5000 FROM c RETURNING id
    ), b AS (
      INSERT INTO bills (bill_number, business_date, subtotal, discount,
                         total, payment_method, idempotency_key, created_by)
      SELECT 9100, '2026-01-02', 5000, 0, 5000, 'CASH', gen_random_uuid(), u.id
      FROM u RETURNING id
    )
    INSERT INTO bill_items (bill_id, item_id, item_name, category_name,
                            unit_price, quantity, line_total)
    SELECT b.id, i.id, 'Probe Item', 'Probe Category', 5000, 1, 5000
    FROM b, i
    RETURNING id, bill_id
  `);

  const { id: lineId, bill_id: billId } = setup.rows[0] as {
    id: string;
    bill_id: string;
  };

  await expectRejection(
    "UPDATE on bill_items",
    sql`UPDATE bill_items SET quantity = 99 WHERE id = ${lineId}::uuid`,
  );
  await expectRejection(
    "DELETE on bill_items",
    sql`DELETE FROM bill_items WHERE id = ${lineId}::uuid`,
  );
  await expectRejection(
    "DELETE on bills",
    sql`DELETE FROM bills WHERE id = ${billId}::uuid`,
  );
  await expectRejection(
    "UPDATE of a non-void column on bills",
    sql`UPDATE bills SET total = 1 WHERE id = ${billId}::uuid`,
  );

  // The one permitted mutation must SUCCEED.
  try {
    await db.execute(sql`
      UPDATE bills SET status = 'VOID', voided_at = now(), void_reason = 'probe'
      WHERE id = ${billId}::uuid
    `);
    console.log("PASS — voiding a bill is permitted");
  } catch (error) {
    console.error("FAIL — voiding a bill was rejected:", error);
    process.exitCode = 1;
  }

  // Clean up. Triggers block DELETE on bills, so drop them for the teardown.
  await db.execute(sql`ALTER TABLE bill_items DISABLE TRIGGER bill_items_immutable`);
  await db.execute(sql`ALTER TABLE bills DISABLE TRIGGER bills_no_delete`);
  await db.execute(sql`DELETE FROM bill_items WHERE bill_id = ${billId}::uuid`);
  await db.execute(sql`DELETE FROM bills WHERE id = ${billId}::uuid`);
  await db.execute(sql`ALTER TABLE bill_items ENABLE TRIGGER bill_items_immutable`);
  await db.execute(sql`ALTER TABLE bills ENABLE TRIGGER bills_no_delete`);
  await db.execute(sql`DELETE FROM items WHERE name = 'Probe Item'`);
  await db.execute(sql`DELETE FROM categories WHERE name = 'Probe Category'`);
  await db.execute(sql`DELETE FROM users WHERE username = 'immutability-probe'`);

  process.exit(process.exitCode ?? 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json` scripts: `"db:verify-immutability": "tsx --env-file=.env.local scripts/verify-immutability.ts"`

- [ ] **Step 5: Run it — this is M1's gate**

```bash
npm run db:verify-immutability
```

Expected: four `PASS` rejection lines, then `PASS — voiding a bill is permitted`, exit code 0.

**Do not proceed past this task until every line reads PASS.** Spec §6 Principle 3 is the foundation of the audit guarantee; if the triggers are not live, nothing built on top of them is trustworthy.

---

### Task 8: Seed script

**Files:**
- Create: `src/db/seed.ts`, `src/lib/auth/password.ts`

**Interfaces:**
- Consumes: all tables; `SEED_SUPERADMIN_*` env vars from Task 2
- Produces: `hashPassword(plain: string): Promise<string>` and `verifyPassword(plain: string, hash: string): Promise<boolean>` from `@/lib/auth/password`. A seeded database with one superadmin, a settings row, and a sample menu.

- [ ] **Step 1: Install bcrypt**

```bash
npm install bcryptjs
npm install -D @types/bcryptjs
```

`bcryptjs` rather than `bcrypt` — it is pure JavaScript and needs no native build step, which matters on Netlify's build image.

- [ ] **Step 2: Create the password helpers**

`src/lib/auth/password.ts`:

```ts
import bcrypt from "bcryptjs";

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 3: Write the seed script**

`src/db/seed.ts`:

```ts
import { eq } from "drizzle-orm";

import { db } from "./index";
import { categories, items, shopSettings, users } from "./schema";
import { hashPassword } from "../lib/auth/password";

const SAMPLE_MENU: Array<{
  category: string;
  sortOrder: number;
  items: Array<{ name: string; price: number }>;
}> = [
  {
    category: "Burgers",
    sortOrder: 1,
    items: [
      { name: "Veg Burger", price: 6000 },
      { name: "Cheese Burger", price: 8000 },
      { name: "Chicken Burger", price: 11000 },
    ],
  },
  {
    category: "Sides",
    sortOrder: 2,
    items: [
      { name: "French Fries", price: 4000 },
      { name: "Peri Peri Fries", price: 5000 },
      { name: "Nuggets (6 pc)", price: 9000 },
    ],
  },
  {
    category: "Drinks",
    sortOrder: 3,
    items: [
      { name: "Coke Small", price: 3000 },
      { name: "Coke Large", price: 5000 },
      { name: "Cold Coffee", price: 7000 },
    ],
  },
];

async function main() {
  const username = process.env.SEED_SUPERADMIN_USERNAME;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  const name = process.env.SEED_SUPERADMIN_NAME;

  if (!username || !password || !name) {
    throw new Error(
      "SEED_SUPERADMIN_USERNAME, SEED_SUPERADMIN_PASSWORD and SEED_SUPERADMIN_NAME must all be set.",
    );
  }
  if (password.length < 8) {
    throw new Error("SEED_SUPERADMIN_PASSWORD must be at least 8 characters.");
  }

  // --- superadmin -----------------------------------------------------
  const existingUser = await db.query.users.findFirst({
    where: eq(users.username, username),
  });

  if (existingUser) {
    console.log(`Superadmin "${username}" already exists — skipping.`);
  } else {
    await db.insert(users).values({
      username,
      passwordHash: await hashPassword(password),
      name,
      role: "SUPERADMIN",
    });
    console.log(`Created superadmin "${username}".`);
  }

  // --- shop settings --------------------------------------------------
  const existingSettings = await db.query.shopSettings.findFirst();
  if (existingSettings) {
    console.log("Shop settings already exist — skipping.");
  } else {
    await db.insert(shopSettings).values({
      id: true,
      shopName: "My Fast Food Shop",
      addressLine: "123 Main Road, City",
      phone: "98765 43210",
      receiptFooter: "Thank you! Visit again",
      printerWidth: "MM_80",
      timezone: "Asia/Kolkata",
    });
    console.log("Created shop settings.");
  }

  // --- sample menu ----------------------------------------------------
  for (const group of SAMPLE_MENU) {
    const existingCategory = await db.query.categories.findFirst({
      where: eq(categories.name, group.category),
    });

    const categoryId =
      existingCategory?.id ??
      (
        await db
          .insert(categories)
          .values({ name: group.category, sortOrder: group.sortOrder })
          .returning({ id: categories.id })
      )[0].id;

    for (const [index, item] of group.items.entries()) {
      const existingItem = await db.query.items.findFirst({
        where: eq(items.name, item.name),
      });
      if (existingItem) continue;

      await db.insert(items).values({
        categoryId,
        name: item.name,
        price: item.price,
        sortOrder: index,
      });
    }
    console.log(`Seeded category "${group.category}".`);
  }

  console.log("\nSeed complete.");
  process.exit(0);
}

main().catch((error) => {
  console.error("Seed FAILED:", error);
  process.exit(1);
});
```

The script is idempotent — running it twice changes nothing. That matters because it will be re-run against the client's real menu at M7.

- [ ] **Step 4: Run the seed**

```bash
npm run db:seed
```

Expected:

```
Created superadmin "owner".
Created shop settings.
Seeded category "Burgers".
Seeded category "Sides".
Seeded category "Drinks".

Seed complete.
```

- [ ] **Step 5: Verify idempotency**

```bash
npm run db:seed
```

Expected: every line now says "already exists — skipping", and no error. Row counts are unchanged.

- [ ] **Step 6: Verify the data landed**

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`
  SELECT c.name AS category, i.name AS item, i.price
  FROM items i JOIN categories c ON c.id = i.category_id
  ORDER BY c.sort_order, i.sort_order\`);
console.table(r.rows);
process.exit(0);
"
```

Expected: nine rows, prices as integers (6000, 8000, 11000, …). If any price shows a decimal point, a float leaked in — stop and fix it.

---

# M2 — Authentication

### Task 9: Auth.js configuration

**Files:**
- Create: `src/auth.config.ts`, `src/auth.ts`, `src/types/next-auth.d.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/lib/validation/user-schema.ts`

**Interfaces:**
- Consumes: `users` table, `verifyPassword` from Task 8
- Produces: `auth()`, `signIn()`, `signOut()`, `handlers` from `@/auth`. Session shape `{ user: { id, name, username, role } }`. `loginSchema` from `@/lib/validation/user-schema`.

- [ ] **Step 1: Install Auth.js**

```bash
npm install next-auth@beta zod
```

- [ ] **Step 2: Create the login validation schema**

`src/lib/validation/user-schema.ts`:

```ts
import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginInput = z.infer<typeof loginSchema>;
```

- [ ] **Step 3: Declare the session type**

`src/types/next-auth.d.ts`:

```ts
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      username: string;
      role: "ADMIN" | "SUPERADMIN";
    } & DefaultSession["user"];
  }

  interface User {
    id?: string;
    username: string;
    role: "ADMIN" | "SUPERADMIN";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    username: string;
    role: "ADMIN" | "SUPERADMIN";
  }
}
```

- [ ] **Step 4: Create the edge-safe config**

`src/auth.config.ts` holds only what middleware needs — no database imports, because middleware runs on the edge runtime where the Neon Pool cannot open.

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
    // One shift.
    maxAge: 8 * 60 * 60,
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.username = user.username;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id;
      session.user.username = token.username;
      session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 5: Create the full config**

`src/auth.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { db } from "./db";
import { users } from "./db/schema";
import { verifyPassword } from "./lib/auth/password";
import { loginSchema } from "./lib/validation/user-schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { username, password } = parsed.data;

        const user = await db.query.users.findFirst({
          where: sql`lower(${users.username}) = lower(${username})`,
        });

        // Same null return for every failure — never reveal which check failed.
        if (!user) return null;
        if (!user.isActive) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) return null;

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) return null;

        // Successful login clears any accumulated failures.
        if (user.failedAttempts > 0 || user.lockedUntil) {
          await db
            .update(users)
            .set({ failedAttempts: 0, lockedUntil: null })
            .where(eq(users.id, user.id));
        }

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          role: user.role,
        };
      },
    }),
  ],
});
```

- [ ] **Step 6: Create the route handler**

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "@/auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 7: Verify it compiles and the endpoint responds**

```bash
npx tsc --noEmit
npm run dev
```

In another terminal:

```bash
curl -s http://localhost:3000/api/auth/providers
```

Expected: JSON containing a `credentials` provider. If you get a 500, `AUTH_SECRET` is missing from `.env.local`.

---

### Task 10: Role guards

**Files:**
- Create: `src/lib/auth/guard.ts`, `src/lib/utils/result.ts`
- Create: `src/constants/roles.ts`

**Interfaces:**
- Consumes: `auth()` from Task 9
- Produces:
  - `ActionResult<T>`, `ErrorCode`, `ok(data)`, `fail(code, message, fields?)` from `@/lib/utils/result`
  - `requireUser(): Promise<SessionUser>` — throws `GuardError` if unauthenticated
  - `requireSuperadmin(): Promise<SessionUser>` — throws `GuardError` if not superadmin
  - `toActionResult(error)` — converts a thrown `GuardError` into a failed `ActionResult`
  - `SessionUser = { id: string; name: string; username: string; role: Role }`

- [ ] **Step 1: Create the role constants**

`src/constants/roles.ts`:

```ts
export const ROLES = ["ADMIN", "SUPERADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Cashier",
  SUPERADMIN: "Owner",
};
```

- [ ] **Step 2: Create the result helpers**

`src/lib/utils/result.ts`:

```ts
export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PRICE_CHANGED"
  | "DB_UNAVAILABLE"
  | "UNKNOWN";

export type ActionError = {
  code: ErrorCode;
  message: string;
  fields?: Record<string, string>;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ActionError };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail<T = never>(
  code: ErrorCode,
  message: string,
  fields?: Record<string, string>,
): ActionResult<T> {
  return { ok: false, error: { code, message, fields } };
}
```

- [ ] **Step 3: Create the guards**

`src/lib/auth/guard.ts`:

```ts
import { auth } from "@/auth";
import type { Role } from "@/constants/roles";
import { type ActionResult, type ErrorCode, fail } from "@/lib/utils/result";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
};

export class GuardError extends Error {
  constructor(
    readonly code: Extract<ErrorCode, "UNAUTHORIZED" | "FORBIDDEN">,
    message: string,
  ) {
    super(message);
    this.name = "GuardError";
  }
}

/**
 * Call this on the first line of every server action and protected page.
 * Middleware only redirects; server actions are publicly callable endpoints,
 * so this is the actual access control. See spec §7.2.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new GuardError("UNAUTHORIZED", "You must be signed in.");
  }
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.username,
    username: session.user.username,
    role: session.user.role,
  };
}

export async function requireSuperadmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "SUPERADMIN") {
    throw new GuardError(
      "FORBIDDEN",
      "Only the owner account can do this.",
    );
  }
  return user;
}
```

- [ ] **Step 4: Add the guard-to-result converter**

Append to `src/lib/auth/guard.ts` (the imports it needs are already at the top from Step 3):

```ts
/**
 * Wrap a server action body so guard failures become ActionResults rather
 * than unhandled exceptions, and unexpected errors never leak internals.
 */
export async function guarded<T>(
  run: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof GuardError) {
      return fail(error.code, error.message);
    }
    const correlationId = crypto.randomUUID().slice(0, 8);
    console.error(`[${correlationId}] Unhandled action error:`, error);
    return fail(
      "UNKNOWN",
      `Something went wrong. Quote reference ${correlationId} if you report this.`,
    );
  }
}
```

Move the `import { type ActionResult, fail }` line to the top of the file with the other imports.

- [ ] **Step 5: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

---

### Task 11: Middleware and the login page

**Files:**
- Create: `src/middleware.ts`
- Create: `src/components/pages/login/LoginPage.tsx`, `components/LoginForm.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/server/users/login-action.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `authConfig`, `signIn`, `loginSchema`, `ActionResult`
- Produces: `loginAction(formData): Promise<ActionResult<null>>`. A working `/login` route that establishes a session.

- [ ] **Step 1: Create the middleware**

`src/middleware.ts`:

```ts
import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Uses the edge-safe config only — no database, no bcrypt.
const { auth } = NextAuth(authConfig);

const PUBLIC_ROUTES = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
  const isLoggedIn = Boolean(req.auth?.user);

  if (!isLoggedIn && !isPublic) {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("next", pathname);
    return Response.redirect(url);
  }

  if (isLoggedIn && isPublic) {
    return Response.redirect(new URL("/bill", req.nextUrl.origin));
  }
});

export const config = {
  // Everything except static assets and the auth endpoints.
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|images).*)"],
};
```

- [ ] **Step 2: Create the login action**

`src/server/users/login-action.ts`:

```ts
"use server";

import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { loginSchema } from "@/lib/validation/user-schema";
import { type ActionResult, fail, ok } from "@/lib/utils/result";

export async function loginAction(
  formData: FormData,
): Promise<ActionResult<null>> {
  const parsed = loginSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") fields[key] = issue.message;
    }
    return fail("VALIDATION", "Check the details below.", fields);
  }

  try {
    await signIn("credentials", {
      username: parsed.data.username,
      password: parsed.data.password,
      redirect: false,
    });
    return ok(null);
  } catch (error) {
    if (error instanceof AuthError) {
      // Deliberately vague: never reveal whether the username exists.
      return fail("UNAUTHORIZED", "Incorrect username or password.");
    }
    throw error;
  }
}
```

- [ ] **Step 3: Create the login form**

`src/components/pages/login/components/LoginForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/users/login-action";

export function LoginForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await loginAction(formData);
      if (result.ok) {
        router.push("/bill");
        router.refresh();
        return;
      }
      setError(result.error.message);
      setFieldErrors(result.error.fields ?? {});
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <Input
          id="username"
          name="username"
          autoComplete="username"
          autoFocus
          required
          disabled={isPending}
        />
        {fieldErrors.username ? (
          <p className="text-sm text-destructive">{fieldErrors.username}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
        />
        {fieldErrors.password ? (
          <p className="text-sm text-destructive">{fieldErrors.password}</p>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create the login page component**

`src/components/pages/login/LoginPage.tsx`:

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { LoginForm } from "./components/LoginForm";

export function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Billing</CardTitle>
          <CardDescription>Sign in to start taking orders.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Create the thin route**

`src/app/login/page.tsx`:

```tsx
import { LoginPage } from "@/components/pages/login/LoginPage";

export const metadata = {
  title: "Sign in | Billing",
  description: "Sign in to the billing system.",
};

export default function Page() {
  return <LoginPage />;
}
```

- [ ] **Step 6: Make the root redirect to the till**

`src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function Page() {
  redirect("/bill");
}
```

- [ ] **Step 7: Verify the login flow end to end**

```bash
npm run dev
```

1. Open `http://localhost:3000/` — expected: redirected to `/login?next=/bill`.
2. Enter a wrong password — expected: "Incorrect username or password."
3. Enter a username that does not exist — expected: the **same** message, not a different one.
4. Enter the seeded superadmin credentials — expected: navigation to `/bill` (a 404 for now; that route arrives in Task 23).
5. Navigate back to `/login` while signed in — expected: redirected to `/bill`.

---

### Task 12: Login lockout and audit logging

**Files:**
- Create: `src/server/audit/write-audit-log.ts`, `src/server/users/login-attempts.ts`
- Modify: `src/auth.ts`

**Interfaces:**
- Consumes: `auditLog`, `users` tables; `AuditAction` from Task 6
- Produces:
  - `writeAuditLog(entry): Promise<void>` where `entry = { actorId?, action: AuditAction, entityType: string, entityId?, before?, after? }`
  - `registerFailedLogin(username: string): Promise<void>`
  - `MAX_FAILED_ATTEMPTS = 5`, `LOCKOUT_MINUTES = 5`

- [ ] **Step 1: Create the audit writer**

`src/server/audit/write-audit-log.ts`:

```ts
import { db } from "@/db";
import { auditLog } from "@/db/schema";
import type { AuditAction } from "@/constants/audit-actions";

export type AuditEntry = {
  actorId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Never throws. An audit write failing must not take down the operation it
 * is recording — but it must be loud in the server log.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: entry.actorId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
    });
  } catch (error) {
    console.error("AUDIT WRITE FAILED", entry.action, entry.entityType, error);
  }
}
```

- [ ] **Step 2: Create the lockout logic**

`src/server/users/login-attempts.ts`:

```ts
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { writeAuditLog } from "@/server/audit/write-audit-log";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 5;

/**
 * Records a failed sign-in against the account and locks it after
 * MAX_FAILED_ATTEMPTS consecutive failures. Silently does nothing when the
 * username does not exist — we must not reveal which usernames are real.
 */
export async function registerFailedLogin(username: string): Promise<void> {
  const user = await db.query.users.findFirst({
    where: sql`lower(${users.username}) = lower(${username})`,
    columns: { id: true, failedAttempts: true },
  });

  if (!user) return;

  const attempts = user.failedAttempts + 1;
  const shouldLock = attempts >= MAX_FAILED_ATTEMPTS;

  await db
    .update(users)
    .set({
      failedAttempts: attempts,
      lockedUntil: shouldLock
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
        : null,
    })
    .where(sql`${users.id} = ${user.id}`);

  await writeAuditLog({
    actorId: user.id,
    action: shouldLock ? "LOGIN_LOCKED" : "LOGIN_FAILED",
    entityType: "user",
    entityId: user.id,
    after: { failedAttempts: attempts, locked: shouldLock },
  });
}
```

- [ ] **Step 3: Wire it into the credentials provider**

In `src/auth.ts`, add the import:

```ts
import { registerFailedLogin } from "./server/users/login-attempts";
```

Then replace each failing `return null` in `authorize` so the failure is recorded. The block becomes:

```ts
        const user = await db.query.users.findFirst({
          where: sql`lower(${users.username}) = lower(${username})`,
        });

        if (!user) {
          // No such account — nothing to count, and we must not reveal that.
          return null;
        }
        if (!user.isActive) {
          return null;
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          await registerFailedLogin(username);
          return null;
        }
```

- [ ] **Step 4: Verify the lockout triggers**

```bash
npm run dev
```

At `/login`, enter the seeded username with a wrong password **five times**. Then enter the **correct** password.

Expected: the correct password is now also rejected. Confirm the database state:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const u = await db.execute(sql\`SELECT username, failed_attempts, locked_until FROM users\`);
console.table(u.rows);
const a = await db.execute(sql\`SELECT action, created_at FROM audit_log ORDER BY created_at DESC LIMIT 6\`);
console.table(a.rows);
process.exit(0);
"
```

Expected: `failed_attempts` is 5, `locked_until` is roughly five minutes in the future, and the audit log shows four `LOGIN_FAILED` rows followed by one `LOGIN_LOCKED`.

- [ ] **Step 5: Verify the lock clears**

Unlock manually rather than waiting:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
await db.execute(sql\`UPDATE users SET failed_attempts = 0, locked_until = NULL\`);
console.log('cleared');
process.exit(0);
"
```

Sign in with the correct password. Expected: success, and `failed_attempts` stays 0.

---

### Task 13: Application shell

**Files:**
- Create: `src/components/providers/AppProviders.tsx`
- Create: `src/components/layout/AppNavbar.tsx`, `UserMenu.tsx`, `Container.tsx`
- Create: `src/lib/auth/logout.ts`
- Create: `src/app/(app)/layout.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `requireUser` from Task 10, `signOut` from Task 9
- Produces: an authenticated layout wrapping every `(app)` route with a navbar showing the signed-in user and a sign-out control. `logoutAction()` server action.

- [ ] **Step 1: Add the dropdown-menu component**

```bash
npx shadcn@latest add dropdown-menu
```

- [ ] **Step 2: Create the logout action**

`src/lib/auth/logout.ts`:

```ts
"use server";

import { signOut } from "@/auth";

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}
```

- [ ] **Step 3: Create the providers wrapper**

`src/components/providers/AppProviders.tsx`:

```tsx
"use client";

import { Toaster } from "@/components/ui/sonner";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster richColors position="top-center" />
    </>
  );
}
```

- [ ] **Step 4: Create the container**

`src/components/layout/Container.tsx`:

```tsx
import { cn } from "@/lib/utils";

export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-350 px-4", className)}>
      {children}
    </div>
  );
}
```

- [ ] **Step 5: Create the user menu**

`src/components/layout/UserMenu.tsx`:

```tsx
"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, type Role } from "@/constants/roles";
import { logoutAction } from "@/lib/auth/logout";

export function UserMenu({ name, role }: { name: string; role: Role }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2">
          <span className="font-medium">{name}</span>
          <span className="text-xs text-muted-foreground">
            {ROLE_LABELS[role]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <form action={logoutAction} className="w-full">
            <button type="submit" className="flex w-full items-center gap-2">
              <LogOut className="size-4" />
              Sign out
            </button>
          </form>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 6: Create the navbar**

`src/components/layout/AppNavbar.tsx`:

```tsx
import Link from "next/link";

import { Container } from "@/components/layout/Container";
import { UserMenu } from "@/components/layout/UserMenu";
import type { SessionUser } from "@/lib/auth/guard";

// Reports and administration links arrive in Plan 2 (M4-M6).
const NAV_LINKS = [{ href: "/bill", label: "New Bill" }];

export function AppNavbar({ user }: { user: SessionUser }) {
  return (
    <header className="border-b bg-background">
      <Container className="flex h-14 items-center justify-between gap-4">
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <UserMenu name={user.name} role={user.role} />
      </Container>
    </header>
  );
}
```

- [ ] **Step 7: Create the authenticated layout**

`src/app/(app)/layout.tsx`:

```tsx
import { AppNavbar } from "@/components/layout/AppNavbar";
import { requireUser } from "@/lib/auth/guard";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Middleware already redirected anonymous requests; this is the real gate.
  const user = await requireUser();

  return (
    <div className="flex min-h-screen flex-col">
      <AppNavbar user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
```

- [ ] **Step 8: Update the root layout to providers only**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppProviders } from "@/components/providers/AppProviders";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Billing",
  description: "Counter billing for a fast food shop.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
```

The root layout deliberately holds no navigation — that is what lets `/print/[billId]` render bare in Task 24.

- [ ] **Step 9: Create a temporary placeholder route to prove the shell**

`src/app/(app)/bill/page.tsx`:

```tsx
import { Container } from "@/components/layout/Container";

export const metadata = { title: "New Bill | Billing" };

export default function Page() {
  return (
    <Container className="py-8">
      <p className="text-muted-foreground">Billing screen — built in Task 23.</p>
    </Container>
  );
}
```

- [ ] **Step 10: Verify the shell — M2's gate**

```bash
npm run dev
```

1. Sign in — expected: `/bill` renders with a navbar showing the seeded user's name and "Owner".
2. Click the name, then Sign out — expected: back at `/login`.
3. Visit `/bill` directly while signed out — expected: redirected to `/login?next=/bill`.

```bash
npx tsc --noEmit && npm run build
```

Expected: both exit 0.

---

# M3 — Billing and Printing

### Task 14: Money, date and formatting helpers

**Files:**
- Create: `src/lib/utils/money.ts`, `src/lib/utils/dates.ts`
- Create: `scripts/verify-money.ts`
- Modify: `src/lib/utils/index.ts`, `package.json`

**Interfaces:**
- Consumes: nothing (pure functions, no I/O)
- Produces:
  - `parseRupees(rupees: string): number`
  - `formatINR(paise: number): string`
  - `lineTotal(unitPrice: number, quantity: number): number`
  - `billTotal(lines: Array<{ unitPrice: number; quantity: number }>, discount: number): { subtotal: number; discount: number; total: number }`
  - `businessDate(at: Date, timeZone: string): string` — returns `YYYY-MM-DD`
  - `formatBillDate(iso: string): string`, `formatBillTime(date: Date, timeZone: string): string`

- [ ] **Step 1: Write the money helpers**

`src/lib/utils/money.ts`:

```ts
/**
 * All amounts in this application are integer paise. This file is the only
 * place money arithmetic happens. See spec §11.3.
 */

// Up to two decimal places, no sign, no separators.
const RUPEE_PATTERN = /^\d+(\.\d{1,2})?$/;

/**
 * Parses a rupee string into integer paise using STRING arithmetic.
 * `parseFloat(x) * 100` is deliberately avoided — it is the classic source
 * of off-by-one-paise rounding bugs.
 */
export function parseRupees(rupees: string): number {
  const trimmed = rupees.trim();
  if (!RUPEE_PATTERN.test(trimmed)) {
    throw new Error(`Invalid rupee amount: "${rupees}"`);
  }
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Display only. This is the one permitted division by 100 — the result is
 * never fed back into arithmetic.
 */
export function formatINR(paise: number): string {
  return INR.format(paise / 100);
}

/** Plain digits for the receipt's aligned columns — no symbol, no grouping. */
export function formatReceiptAmount(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function lineTotal(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

export type PricedLine = { unitPrice: number; quantity: number };

/**
 * Computes bill totals. The discount is CLAMPED to [0, subtotal]; callers
 * that need to know the raw value was out of range should compare the
 * returned `discount` against what they passed in.
 */
export function billTotal(
  lines: PricedLine[],
  discount: number,
): { subtotal: number; discount: number; total: number } {
  const subtotal = lines.reduce(
    (sum, line) => sum + lineTotal(line.unitPrice, line.quantity),
    0,
  );
  const discount = Math.min(Math.max(discount, 0), subtotal);
  return { subtotal, discount, total: subtotal - discount };
}
```

- [ ] **Step 2: Write the date helpers**

`src/lib/utils/dates.ts`:

```ts
/**
 * The shop's business date. Timestamps are stored in UTC, but "today's
 * sales" must mean today in the shop's timezone. See spec §6.11.
 */
export function businessDate(at: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD, which is exactly what a `date` column wants.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** "2026-08-26" -> "26/08/26", the compact form used on receipts. */
export function formatBillDate(businessDateIso: string): string {
  const [year, month, day] = businessDateIso.split("-");
  return `${day}/${month}/${year.slice(2)}`;
}

export function formatBillTime(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}
```

- [ ] **Step 3: Re-export from the barrel**

`src/lib/utils/index.ts`:

```ts
export * from "./cn";
export * from "./dates";
export * from "./money";
export * from "./result";
```

- [ ] **Step 4: Write the money verification script**

Spec §16.3 says the mitigation for having no test framework is that money handling is confined to a few small functions. This script is the manual check on them.

`scripts/verify-money.ts`:

```ts
import {
  billTotal,
  formatReceiptAmount,
  lineTotal,
  parseRupees,
} from "../src/lib/utils/money";
import { businessDate, formatBillDate } from "../src/lib/utils/dates";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  if (!pass) failures += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"} — ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
  );
}

function checkThrows(label: string, run: () => unknown) {
  try {
    run();
    failures += 1;
    console.log(`FAIL — ${label}: did not throw`);
  } catch {
    console.log(`PASS — ${label}: threw as expected`);
  }
}

// --- parseRupees ---------------------------------------------------------
check("parseRupees whole rupees", parseRupees("60"), 6000);
check("parseRupees two decimals", parseRupees("60.50"), 6050);
check("parseRupees one decimal", parseRupees("60.5"), 6050);
check("parseRupees zero", parseRupees("0"), 0);
check("parseRupees the classic float trap", parseRupees("1.15"), 115);
check("parseRupees large amount", parseRupees("12345.67"), 1234567);
check("parseRupees surrounding spaces", parseRupees("  99.99  "), 9999);
checkThrows("parseRupees rejects three decimals", () => parseRupees("60.505"));
checkThrows("parseRupees rejects negatives", () => parseRupees("-5"));
checkThrows("parseRupees rejects letters", () => parseRupees("60abc"));
checkThrows("parseRupees rejects empty", () => parseRupees(""));

// --- formatReceiptAmount ---------------------------------------------
check("formatReceiptAmount pads paise", formatReceiptAmount(6050), "60.50");
check("formatReceiptAmount single paisa", formatReceiptAmount(6005), "60.05");
check("formatReceiptAmount zero", formatReceiptAmount(0), "0.00");

// --- lineTotal --------------------------------------------------------
check("lineTotal", lineTotal(6000, 3), 18000);
check("lineTotal quantity one", lineTotal(11000, 1), 11000);

// --- billTotal --------------------------------------------------------
check(
  "billTotal without discount",
  billTotal([{ unitPrice: 6000, quantity: 2 }, { unitPrice: 3000, quantity: 1 }], 0),
  { subtotal: 15000, discount: 0, total: 15000 },
);
check(
  "billTotal with discount",
  billTotal([{ unitPrice: 6000, quantity: 2 }, { unitPrice: 3000, quantity: 1 }], 1000),
  { subtotal: 15000, discount: 1000, total: 14000 },
);
check(
  "billTotal clamps a discount larger than subtotal",
  billTotal([{ unitPrice: 5000, quantity: 1 }], 999999),
  { subtotal: 5000, discount: 5000, total: 0 },
);
check(
  "billTotal clamps a negative discount",
  billTotal([{ unitPrice: 5000, quantity: 1 }], -100),
  { subtotal: 5000, discount: 0, total: 5000 },
);
check("billTotal on an empty cart", billTotal([], 0), {
  subtotal: 0,
  discount: 0,
  total: 0,
});

// --- dates ------------------------------------------------------------
// 2026-08-26T20:30:00Z is 02:00 on the 27th in Kolkata (UTC+5:30).
check(
  "businessDate rolls over at shop-local midnight",
  businessDate(new Date("2026-08-26T20:30:00Z"), "Asia/Kolkata"),
  "2026-08-27",
);
check(
  "businessDate before shop-local midnight",
  businessDate(new Date("2026-08-26T10:00:00Z"), "Asia/Kolkata"),
  "2026-08-26",
);
check("formatBillDate", formatBillDate("2026-08-26"), "26/08/26");

console.log(failures === 0 ? "\nAll money checks passed." : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
```

Add to `package.json` scripts: `"verify:money": "tsx scripts/verify-money.ts"`

- [ ] **Step 5: Run it**

```bash
npm run verify:money
```

Expected: every line `PASS`, then `All money checks passed.`, exit 0.

The `businessDate` rollover check is the one most worth watching — if it fails, daily reports will attribute late-evening bills to the wrong day.

---

### Task 15: Domain types and payment constants

**Files:**
- Create: `src/types/bill.types.ts`, `src/types/item.types.ts`
- Create: `src/constants/payment-methods.ts`

**Interfaces:**
- Consumes: schema types from Tasks 4–5
- Produces:
  - `MenuItem = { id, name, price, imageUrl, isAvailable, categoryId }`
  - `MenuCategory = { id, name, items: MenuItem[] }`
  - `CartLine = { itemId, name, unitPrice, quantity }`
  - `CreateBillInput = { idempotencyKey, lines, discount, paymentMethod, tendered, expectedTotal }`
  - `CreatedBill = { id, billNumber, businessDate, total }`
  - `ReceiptData` — everything `/print/[billId]` needs
  - `PAYMENT_METHODS`, `PAYMENT_METHOD_LABELS`, `PaymentMethod`

- [ ] **Step 1: Create the payment constants**

`src/constants/payment-methods.ts`:

```ts
export const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
  OTHER: "Other",
};

/** Only cash collects a tendered amount and returns change. */
export function collectsTender(method: PaymentMethod): boolean {
  return method === "CASH";
}
```

- [ ] **Step 2: Create the item types**

`src/types/item.types.ts`:

```ts
export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
};

export type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};
```

- [ ] **Step 3: Create the bill types**

`src/types/bill.types.ts`:

```ts
import type { PaymentMethod } from "@/constants/payment-methods";

/** A line as the cart holds it, client-side. */
export type CartLine = {
  itemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
};

/**
 * What the browser sends. Note there is NO price field — the server re-reads
 * every price. See spec §8.2.
 */
export type CreateBillInput = {
  idempotencyKey: string;
  lines: Array<{ itemId: string; quantity: number }>;
  discount: number;
  paymentMethod: PaymentMethod;
  tendered: number | null;
  /** What the cashier saw on screen. A mismatch aborts with PRICE_CHANGED. */
  expectedTotal: number;
};

export type CreatedBill = {
  id: string;
  billNumber: number;
  businessDate: string;
  total: number;
};

export type ReceiptLine = {
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type ReceiptData = {
  billNumber: number;
  businessDate: string;
  createdAt: Date;
  cashierName: string;
  lines: ReceiptLine[];
  subtotal: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  tendered: number | null;
  changeDue: number | null;
  shop: {
    name: string;
    addressLine: string | null;
    phone: string | null;
    receiptFooter: string | null;
    printerWidth: "MM_80" | "MM_58";
    timezone: string;
  };
};
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

---

### Task 16: Menu query

**Files:**
- Create: `src/server/items/items-queries.ts`, `src/server/settings/settings-queries.ts`

**Interfaces:**
- Consumes: `items`, `categories`, `shopSettings` tables; `MenuCategory` from Task 15; `withConnectionRetry` from Task 3
- Produces:
  - `getMenu(): Promise<MenuCategory[]>` — active categories with their active items, ordered
  - `getShopSettings(): Promise<ShopSettings>` — throws if unseeded
  - `getShopTimezone(): Promise<string>`

All three wrap their bodies in `withConnectionRetry` per Task 3 Step 9 — they are the reads that meet a cold database first each morning.

- [ ] **Step 1: Create the settings queries**

`src/server/settings/settings-queries.ts`:

```ts
import { db } from "@/db";
import type { ShopSettings } from "@/db/schema";

export async function getShopSettings(): Promise<ShopSettings> {
  const settings = await db.query.shopSettings.findFirst();
  if (!settings) {
    throw new Error(
      "Shop settings row is missing. Run `npm run db:seed` before using the app.",
    );
  }
  return settings;
}

export async function getShopTimezone(): Promise<string> {
  const settings = await db.query.shopSettings.findFirst({
    columns: { timezone: true },
  });
  return settings?.timezone ?? "Asia/Kolkata";
}
```

- [ ] **Step 2: Create the menu query**

`src/server/items/items-queries.ts`:

```ts
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, items } from "@/db/schema";
import type { MenuCategory } from "@/types/item.types";

/**
 * The billing screen's entire dataset, fetched once per page load.
 *
 * Retired items and categories (is_active = false) are excluded entirely.
 * Sold-out items (is_available = false) are INCLUDED so the cashier sees
 * them greyed out rather than wondering where they went.
 */
export async function getMenu(): Promise<MenuCategory[]> {
  const rows = await db
    .select({
      categoryId: categories.id,
      categoryName: categories.name,
      itemId: items.id,
      itemName: items.name,
      price: items.price,
      imageUrl: items.imageUrl,
      isAvailable: items.isAvailable,
    })
    .from(categories)
    .innerJoin(items, eq(items.categoryId, categories.id))
    .where(and(eq(categories.isActive, true), eq(items.isActive, true)))
    .orderBy(
      asc(categories.sortOrder),
      asc(categories.name),
      asc(items.sortOrder),
      asc(items.name),
    );

  // Rows arrive already ordered, so grouping preserves that order.
  const grouped = new Map<string, MenuCategory>();

  for (const row of rows) {
    let category = grouped.get(row.categoryId);
    if (!category) {
      category = { id: row.categoryId, name: row.categoryName, items: [] };
      grouped.set(row.categoryId, category);
    }
    category.items.push({
      id: row.itemId,
      categoryId: row.categoryId,
      name: row.itemName,
      price: row.price,
      imageUrl: row.imageUrl,
      isAvailable: row.isAvailable,
    });
  }

  return [...grouped.values()];
}
```

- [ ] **Step 3: Verify the query returns the seeded menu**

```bash
npx tsx --env-file=.env.local -e "
import { getMenu } from './src/server/items/items-queries';
const menu = await getMenu();
for (const c of menu) {
  console.log(c.name);
  for (const i of c.items) console.log('  ', i.name, i.price);
}
process.exit(0);
"
```

Expected: three categories in sort order (Burgers, Sides, Drinks), three items each, prices as integers.

- [ ] **Step 4: Verify retired items disappear**

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
import { getMenu } from './src/server/items/items-queries';
await db.execute(sql\`UPDATE items SET is_active = false WHERE name = 'Coke Small'\`);
const menu = await getMenu();
const names = menu.flatMap(c => c.items.map(i => i.name));
console.log(names.includes('Coke Small') ? 'FAIL — retired item still on the menu' : 'PASS — retired item hidden');
await db.execute(sql\`UPDATE items SET is_active = true WHERE name = 'Coke Small'\`);
process.exit(0);
"
```

Expected: `PASS — retired item hidden`.

---

### Task 17: Bill validation schema

**Files:**
- Create: `src/lib/validation/bill-schema.ts`

**Interfaces:**
- Consumes: `PAYMENT_METHODS` from Task 15
- Produces: `createBillSchema` — a Zod schema parsing to `CreateBillInput`. Exported `MAX_LINE_QUANTITY = 99`.

- [ ] **Step 1: Write the schema**

`src/lib/validation/bill-schema.ts`:

```ts
import { z } from "zod";

import { PAYMENT_METHODS } from "@/constants/payment-methods";

export const MAX_LINE_QUANTITY = 99;

const lineSchema = z.object({
  itemId: z.string().uuid("Invalid item"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(MAX_LINE_QUANTITY, `Quantity cannot exceed ${MAX_LINE_QUANTITY}`),
});

export const createBillSchema = z.object({
  idempotencyKey: z.string().uuid(),
  lines: z.array(lineSchema).min(1, "Add at least one item to the bill"),
  discount: z
    .number()
    .int("Discount must be a whole number of paise")
    .min(0, "Discount cannot be negative"),
  paymentMethod: z.enum(PAYMENT_METHODS),
  tendered: z
    .number()
    .int()
    .min(0, "Amount tendered cannot be negative")
    .nullable(),
  expectedTotal: z.number().int().min(0),
});

export type CreateBillPayload = z.infer<typeof createBillSchema>;
```

Note there is deliberately no price field on `lineSchema`. If a future change adds one, that is a security regression — see Global Constraint 5.

- [ ] **Step 2: Verify the schema rejects what it should**

```bash
npx tsx -e "
import { createBillSchema } from './src/lib/validation/bill-schema';
const base = {
  idempotencyKey: crypto.randomUUID(),
  lines: [{ itemId: crypto.randomUUID(), quantity: 2 }],
  discount: 0, paymentMethod: 'CASH', tendered: null, expectedTotal: 12000,
};
const cases = [
  ['valid payload', base, true],
  ['empty cart', { ...base, lines: [] }, false],
  ['zero quantity', { ...base, lines: [{ itemId: crypto.randomUUID(), quantity: 0 }] }, false],
  ['fractional quantity', { ...base, lines: [{ itemId: crypto.randomUUID(), quantity: 1.5 }] }, false],
  ['negative discount', { ...base, discount: -1 }, false],
  ['unknown payment method', { ...base, paymentMethod: 'BITCOIN' }, false],
  ['non-uuid item', { ...base, lines: [{ itemId: 'abc', quantity: 1 }] }, false],
];
let bad = 0;
for (const [label, input, shouldPass] of cases) {
  const ok = createBillSchema.safeParse(input).success;
  const pass = ok === shouldPass;
  if (!pass) bad++;
  console.log((pass ? 'PASS' : 'FAIL') + ' — ' + label);
}
process.exit(bad === 0 ? 0 : 1);
"
```

Expected: seven `PASS` lines, exit 0.

---

### Task 18: The bill creation service

**Files:**
- Create: `src/server/bills/create-bill-service.ts`
- Create: `src/lib/utils/parse-db-error.ts`

**Interfaces:**
- Consumes: `db`, all bill tables, `billTotal`, `businessDate`, `getShopTimezone`, `CreateBillInput`, `ActionResult`
- Produces: `createBill(input: CreateBillInput, userId: string): Promise<ActionResult<CreatedBill>>` — the single entry point for turning a cart into a persisted bill.

**This is the most important file in the application. Read spec §8.2 before writing it.**

- [ ] **Step 1: Create the database error parser**

`src/lib/utils/parse-db-error.ts`:

```ts
/** Postgres unique-violation SQLSTATE. */
const UNIQUE_VIOLATION = "23505";

type PgError = { code?: string; constraint?: string };

function asPgError(error: unknown): PgError | null {
  if (typeof error !== "object" || error === null) return null;
  return error as PgError;
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pg = asPgError(error);
  if (pg?.code !== UNIQUE_VIOLATION) return false;
  if (!constraint) return true;
  return pg.constraint === constraint;
}
```

- [ ] **Step 2: Write the service**

`src/server/bills/create-bill-service.ts`:

```ts
import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { billCounters, billItems, bills, categories, items } from "@/db/schema";
import { collectsTender } from "@/constants/payment-methods";
import { businessDate } from "@/lib/utils/dates";
import { billTotal, formatINR, lineTotal } from "@/lib/utils/money";
import { isUniqueViolation } from "@/lib/utils/parse-db-error";
import { type ActionResult, fail, ok } from "@/lib/utils/result";
import { getShopTimezone } from "@/server/settings/settings-queries";
import type { CreateBillInput, CreatedBill } from "@/types/bill.types";

const CREATED_BILL_COLUMNS = {
  id: bills.id,
  billNumber: bills.billNumber,
  businessDate: bills.businessDate,
  total: bills.total,
};

async function findByIdempotencyKey(key: string): Promise<CreatedBill | null> {
  const [existing] = await db
    .select(CREATED_BILL_COLUMNS)
    .from(bills)
    .where(eq(bills.idempotencyKey, key))
    .limit(1);
  return existing ?? null;
}

export async function createBill(
  input: CreateBillInput,
  userId: string,
): Promise<ActionResult<CreatedBill>> {
  // ---- 1. Idempotency short-circuit --------------------------------
  // A retry after a timeout must return the original bill, never a duplicate.
  const alreadySaved = await findByIdempotencyKey(input.idempotencyKey);
  if (alreadySaved) return ok(alreadySaved);

  // ---- 2. Validation phase -----------------------------------------
  // Everything that can fail happens BEFORE the transaction opens.
  // Returning a value from inside db.transaction() COMMITS it — only a
  // thrown error rolls back. See Global Constraint 7.

  const itemIds = [...new Set(input.lines.map((line) => line.itemId))];

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      price: items.price,
      isActive: items.isActive,
      isAvailable: items.isAvailable,
      categoryName: categories.name,
    })
    .from(items)
    .innerJoin(categories, eq(items.categoryId, categories.id))
    .where(inArray(items.id, itemIds));

  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const line of input.lines) {
    const item = byId.get(line.itemId);
    if (!item) {
      return fail(
        "CONFLICT",
        "An item on this bill no longer exists. Remove it and try again.",
      );
    }
    if (!item.isActive) {
      return fail(
        "CONFLICT",
        `"${item.name}" has been removed from the menu. Remove it from the bill.`,
      );
    }
    if (!item.isAvailable) {
      return fail(
        "CONFLICT",
        `"${item.name}" is marked sold out. Remove it from the bill.`,
      );
    }
  }

  // Prices come from the database, never from the browser. Spec §8.2.
  const priced = input.lines.map((line) => {
    const item = byId.get(line.itemId)!;
    return {
      itemId: item.id,
      itemName: item.name,
      categoryName: item.categoryName,
      unitPrice: item.price,
      quantity: line.quantity,
      lineTotal: lineTotal(item.price, line.quantity),
    };
  });

  const { subtotal, discount, total } = billTotal(priced, input.discount);

  if (discount !== input.discount) {
    return fail("VALIDATION", "The discount cannot be more than the subtotal.", {
      discount: "Must be between ₹0 and the subtotal",
    });
  }

  if (total !== input.expectedTotal) {
    return fail(
      "PRICE_CHANGED",
      `Prices changed while this bill was open. The new total is ${formatINR(total)}.`,
    );
  }

  let tendered: number | null = null;
  let change: number | null = null;

  if (collectsTender(input.paymentMethod)) {
    tendered = input.tendered;
    if (tendered !== null) {
      change = tendered - total;
      if (change < 0) {
        return fail(
          "VALIDATION",
          "The amount tendered is less than the bill total.",
          { tendered: `Must be at least ${formatINR(total)}` },
        );
      }
    }
  }

  const timeZone = await getShopTimezone();
  const date = businessDate(new Date(), timeZone);

  // ---- 3. Write phase ----------------------------------------------
  // One transaction. Only throws from here on.
  try {
    const created = await db.transaction(async (tx) => {
      // Reserve the day's next number. The ON CONFLICT takes a row lock, so
      // concurrent tills serialize here. Rolling back also rolls this back,
      // which is what makes the sequence gapless. Spec §6.7.
      const [counter] = await tx
        .insert(billCounters)
        .values({ businessDate: date, lastNumber: 1 })
        .onConflictDoUpdate({
          target: billCounters.businessDate,
          set: { lastNumber: sql`${billCounters.lastNumber} + 1` },
        })
        .returning({ lastNumber: billCounters.lastNumber });

      const [bill] = await tx
        .insert(bills)
        .values({
          billNumber: counter.lastNumber,
          businessDate: date,
          subtotal: subtotal,
          discount: discount,
          total: total,
          paymentMethod: input.paymentMethod,
          tendered: tendered,
          changeDue: change,
          idempotencyKey: input.idempotencyKey,
          createdBy: userId,
        })
        .returning(CREATED_BILL_COLUMNS);

      await tx.insert(billItems).values(
        priced.map((line) => ({
          billId: bill.id,
          itemId: line.itemId,
          itemName: line.itemName,
          categoryName: line.categoryName,
          unitPrice: line.unitPrice,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
      );

      return bill;
    });

    return ok(created);
  } catch (error) {
    // Two requests raced with the same key. The other one won; return its bill.
    if (isUniqueViolation(error, "bills_idempotency_key_idx")) {
      const raced = await findByIdempotencyKey(input.idempotencyKey);
      if (raced) return ok(raced);
    }
    throw error;
  }
}
```

- [ ] **Step 3: Verify a bill saves correctly**

Create `scripts/verify-create-bill.ts`:

```ts
import { sql } from "drizzle-orm";

import { db } from "../src/db";
import { createBill } from "../src/server/bills/create-bill-service";
import { getMenu } from "../src/server/items/items-queries";

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (!condition) {
    failures += 1;
    console.log(`FAIL — ${label}`, detail ?? "");
  } else {
    console.log(`PASS — ${label}`);
  }
}

async function main() {
  const [{ id: userId }] = (
    await db.execute(sql`SELECT id FROM users WHERE role = 'SUPERADMIN' LIMIT 1`)
  ).rows as Array<{ id: string }>;

  const menu = await getMenu();
  const burger = menu[0].items[0];
  const drink = menu[2].items[0];

  const expectedTotal = burger.price * 2 + drink.price - 1000;

  const key = crypto.randomUUID();
  const result = await createBill(
    {
      idempotencyKey: key,
      lines: [
        { itemId: burger.id, quantity: 2 },
        { itemId: drink.id, quantity: 1 },
      ],
      discount: 1000,
      paymentMethod: "CASH",
      tendered: expectedTotal + 5000,
      expectedTotal: expectedTotal,
    },
    userId,
  );

  check("bill saved", result.ok, result.ok ? "" : result.error);
  if (!result.ok) process.exit(1);

  check("total matches", result.data.total === expectedTotal);

  // --- idempotency ---
  const repeat = await createBill(
    {
      idempotencyKey: key,
      lines: [{ itemId: burger.id, quantity: 2 }, { itemId: drink.id, quantity: 1 }],
      discount: 1000,
      paymentMethod: "CASH",
      tendered: expectedTotal + 5000,
      expectedTotal: expectedTotal,
    },
    userId,
  );
  check(
    "retry with the same key returns the same bill",
    repeat.ok && repeat.data.id === result.data.id,
  );

  const count = (
    await db.execute(sql`SELECT count(*)::int AS n FROM bills WHERE idempotency_key = ${key}::uuid`)
  ).rows[0] as { n: number };
  check("only one row was written", count.n === 1, count);

  // --- price change detection ---
  const stale = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: burger.id, quantity: 1 }],
      discount: 0,
      paymentMethod: "UPI",
      tendered: null,
      expectedTotal: 1, // deliberately wrong
    },
    userId,
  );
  check(
    "a stale expected total is rejected",
    !stale.ok && stale.error.code === "PRICE_CHANGED",
    stale,
  );

  // --- discount clamp ---
  const overDiscount = await createBill(
    {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ itemId: burger.id, quantity: 1 }],
      discount: 9_999_999,
      paymentMethod: "CASH",
      tendered: 0,
      expectedTotal: 0,
    },
    userId,
  );
  check(
    "a discount larger than the subtotal is rejected",
    !overDiscount.ok && overDiscount.error.code === "VALIDATION",
    overDiscount,
  );

  // --- snapshots ---
  const lines = (
    await db.execute(sql`
      SELECT item_name, unit_price, quantity, line_total
      FROM bill_items WHERE bill_id = ${result.data.id}::uuid ORDER BY item_name`)
  ).rows;
  check("two snapshot lines written", lines.length === 2, lines);
  console.table(lines);

  // --- gapless numbering ---
  const numbers = (
    await db.execute(sql`
      SELECT bill_number FROM bills
      WHERE business_date = ${result.data.businessDate}
      ORDER BY bill_number`)
  ).rows.map((r) => (r as { bill_number: number }).bill_number);
  const gapless = numbers.every((n, i) => n === numbers[0] + i);
  check("bill numbers are contiguous for the day", gapless, numbers);

  console.log(failures === 0 ? "\nAll bill checks passed." : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

Add to `package.json`: `"verify:bill": "tsx --env-file=.env.local scripts/verify-create-bill.ts"`

- [ ] **Step 4: Run it**

```bash
npm run verify:bill
```

Expected: every check `PASS`, the snapshot table printed with integer prices, and `All bill checks passed.`

The two checks that matter most: **"only one row was written"** (idempotency actually works) and **"bill numbers are contiguous"** (the counter is gapless even though a failed attempt happened in between).

- [ ] **Step 5: Verify a failed bill leaves no gap**

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`
  SELECT business_date, last_number,
    (SELECT count(*)::int FROM bills b WHERE b.business_date = c.business_date) AS bills
  FROM bill_counters c\`);
console.table(r.rows);
process.exit(0);
"
```

Expected: `last_number` equals `bills` for each date. If `last_number` is higher, a number was burned by a committed counter increment with no bill — the transaction boundary is wrong.

---

### Task 19: The bill server action

**Files:**
- Create: `src/server/bills/bills-actions.ts`, `src/server/bills/bills-queries.ts`

**Interfaces:**
- Consumes: `createBill` (Task 18), `guarded`/`requireUser` (Task 10), `createBillSchema` (Task 17)
- Produces:
  - `createBillAction(payload: unknown): Promise<ActionResult<CreatedBill>>` — the client's only write entry point
  - `getReceipt(billId: string): Promise<ReceiptData | null>`

- [ ] **Step 1: Write the action**

`src/server/bills/bills-actions.ts`:

```ts
"use server";

import { guarded, requireUser } from "@/lib/auth/guard";
import { createBillSchema } from "@/lib/validation/bill-schema";
import { type ActionResult, fail } from "@/lib/utils/result";
import { createBill } from "@/server/bills/create-bill-service";
import type { CreatedBill } from "@/types/bill.types";

/**
 * Thin by design: guard, validate, delegate, return. Spec §13.1 rule 6.
 */
export async function createBillAction(
  payload: unknown,
): Promise<ActionResult<CreatedBill>> {
  return guarded(async () => {
    const user = await requireUser();

    const parsed = createBillSchema.safeParse(payload);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        fields[issue.path.join(".")] = issue.message;
      }
      return fail<CreatedBill>(
        "VALIDATION",
        "This bill could not be saved. Check the highlighted fields.",
        fields,
      );
    }

    return createBill(parsed.data, user.id);
  });
}
```

- [ ] **Step 2: Write the receipt query**

`src/server/bills/bills-queries.ts`:

```ts
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { billItems, bills, users } from "@/db/schema";
import { getShopSettings } from "@/server/settings/settings-queries";
import type { ReceiptData } from "@/types/bill.types";

export async function getReceipt(billId: string): Promise<ReceiptData | null> {
  const [bill] = await db
    .select({
      billNumber: bills.billNumber,
      businessDate: bills.businessDate,
      createdAt: bills.createdAt,
      subtotal: bills.subtotal,
      discount: bills.discount,
      total: bills.total,
      paymentMethod: bills.paymentMethod,
      tendered: bills.tendered,
      changeDue: bills.changeDue,
      cashierName: users.name,
    })
    .from(bills)
    .innerJoin(users, eq(users.id, bills.createdBy))
    .where(eq(bills.id, billId))
    .limit(1);

  if (!bill) return null;

  // Snapshot columns only — never join to `items`. Spec §6 Principle 2.
  const lines = await db
    .select({
      itemName: billItems.itemName,
      quantity: billItems.quantity,
      unitPrice: billItems.unitPrice,
      lineTotal: billItems.lineTotal,
    })
    .from(billItems)
    .where(eq(billItems.billId, billId))
    .orderBy(asc(billItems.createdAt), asc(billItems.itemName));

  const settings = await getShopSettings();

  return {
    ...bill,
    lines,
    shop: {
      name: settings.shopName,
      addressLine: settings.addressLine,
      phone: settings.phone,
      receiptFooter: settings.receiptFooter,
      printerWidth: settings.printerWidth,
      timezone: settings.timezone,
    },
  };
}
```

- [ ] **Step 3: Verify the action rejects an unauthenticated caller**

```bash
npx tsc --noEmit
npm run dev
```

The action cannot be called from `curl` without a valid action ID, so verify the guard by reading it: confirm `createBillAction` calls `requireUser()` before `createBillSchema.safeParse`. Then verify the receipt query:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
import { getReceipt } from './src/server/bills/bills-queries';
const [{ id }] = (await db.execute(sql\`SELECT id FROM bills ORDER BY created_at DESC LIMIT 1\`)).rows;
const r = await getReceipt(id);
console.log(JSON.stringify(r, null, 2));
process.exit(0);
"
```

Expected: full receipt JSON — shop details, cashier name, snapshot lines, integer amounts.

---

### Task 20: Cart reducer and the container hook

**Files:**
- Create: `src/components/pages/bill/hooks/useCartReducer.ts`
- Create: `src/components/pages/bill/utils/cart.ts`
- Create: `src/components/pages/bill/hooks/useBillPage.ts`

**Interfaces:**
- Consumes: `CartLine`, `billTotal`, `createBillAction`, `MenuCategory`
- Produces:
  - `useCartReducer()` returning `{ lines, addItem, setQuantity, removeItem, clear }`
  - `filterItems(categories, activeCategoryId, search): MenuItem[]` and `topSearchMatch(categories, search): MenuItem | null` from `../utils/cart`
  - `useBillPage({ menu })` returning everything `BillPage` renders:
    `{ categories, activeCategoryId, setActiveCategoryId, search, setSearch, addBySearch, visibleItems, lines, addItem, setQuantity, removeItem, subtotal, discountInput, setDiscountInput, discount, discountExceedsSubtotal, total, paymentMethod, setPaymentMethod, tenderedInput, setTenderedInput, changeDue, canSave, isSaving, error, priceChange, confirmPriceChange, dismissPriceChange, save }`

- [ ] **Step 1: Write the cart utilities**

`src/components/pages/bill/utils/cart.ts`:

```ts
import type { MenuCategory, MenuItem } from "@/types/item.types";

/** Case-insensitive substring match on the item name. */
export function filterItems(
  categories: MenuCategory[],
  activeCategoryId: string | null,
  search: string,
): MenuItem[] {
  const scoped =
    activeCategoryId === null
      ? categories.flatMap((category) => category.items)
      : (categories.find((c) => c.id === activeCategoryId)?.items ?? []);

  const term = search.trim().toLowerCase();
  if (!term) return scoped;

  return scoped.filter((item) => item.name.toLowerCase().includes(term));
}

/**
 * The item a bare Enter in the search box should add: the first match
 * across the WHOLE menu, not just the active category, so the cashier does
 * not have to think about tabs while typing.
 */
export function topSearchMatch(
  categories: MenuCategory[],
  search: string,
): MenuItem | null {
  const term = search.trim().toLowerCase();
  if (!term) return null;

  const all = categories.flatMap((category) => category.items);
  const startsWith = all.find(
    (item) => item.isAvailable && item.name.toLowerCase().startsWith(term),
  );
  if (startsWith) return startsWith;

  return (
    all.find(
      (item) => item.isAvailable && item.name.toLowerCase().includes(term),
    ) ?? null
  );
}
```

- [ ] **Step 2: Write the cart reducer**

`src/components/pages/bill/hooks/useCartReducer.ts`:

```ts
"use client";

import { useCallback, useReducer } from "react";

import { MAX_LINE_QUANTITY } from "@/lib/validation/bill-schema";
import type { CartLine } from "@/types/bill.types";
import type { MenuItem } from "@/types/item.types";

type CartAction =
  | { type: "ADD"; item: MenuItem }
  | { type: "SET_QUANTITY"; itemId: string; quantity: number }
  | { type: "REMOVE"; itemId: string }
  | { type: "CLEAR" };

function reducer(state: CartLine[], action: CartAction): CartLine[] {
  switch (action.type) {
    case "ADD": {
      const existing = state.find((line) => line.itemId === action.item.id);
      if (existing) {
        if (existing.quantity >= MAX_LINE_QUANTITY) return state;
        return state.map((line) =>
          line.itemId === action.item.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [
        ...state,
        {
          itemId: action.item.id,
          name: action.item.name,
          unitPrice: action.item.price,
          quantity: 1,
        },
      ];
    }
    case "SET_QUANTITY": {
      if (action.quantity <= 0) {
        return state.filter((line) => line.itemId !== action.itemId);
      }
      const quantity = Math.min(action.quantity, MAX_LINE_QUANTITY);
      return state.map((line) =>
        line.itemId === action.itemId ? { ...line, quantity } : line,
      );
    }
    case "REMOVE":
      return state.filter((line) => line.itemId !== action.itemId);
    case "CLEAR":
      return [];
  }
}

export function useCartReducer() {
  const [lines, dispatch] = useReducer(reducer, []);

  const addItem = useCallback((item: MenuItem) => {
    dispatch({ type: "ADD", item });
  }, []);

  const setQuantity = useCallback((itemId: string, quantity: number) => {
    dispatch({ type: "SET_QUANTITY", itemId, quantity });
  }, []);

  const removeItem = useCallback((itemId: string) => {
    dispatch({ type: "REMOVE", itemId });
  }, []);

  const clear = useCallback(() => {
    dispatch({ type: "CLEAR" });
  }, []);

  return { lines, addItem, setQuantity, removeItem, clear };
}
```

- [ ] **Step 3: Write the container hook**

`src/components/pages/bill/hooks/useBillPage.ts`:

```ts
"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { collectsTender, type PaymentMethod } from "@/constants/payment-methods";
import { billTotal, parseRupees } from "@/lib/utils/money";
import { createBillAction } from "@/server/bills/bills-actions";
import type { MenuCategory, MenuItem } from "@/types/item.types";

import { filterItems, topSearchMatch } from "../utils/cart";
import { useCartReducer } from "./useCartReducer";

/** Blank input means zero, not an error. Anything unparseable means zero too. */
function safeToPaise(input: string): number {
  if (!input.trim()) return 0;
  try {
    return parseRupees(input);
  } catch {
    return 0;
  }
}

export function useBillPage({ menu }: { menu: MenuCategory[] }) {
  const router = useRouter();
  const [isSaving, startSaving] = useTransition();

  const { lines, addItem, setQuantity, removeItem, clear } = useCartReducer();

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [discountInput, setDiscountInput] = useState("");
  const [tenderedInput, setTenderedInput] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [error, setError] = useState<string | null>(null);
  const [priceChange, setPriceChange] = useState<string | null>(null);

  // A fresh key per cart. Retrying a failed save reuses it, so the retry
  // cannot create a second bill. Spec §8.4.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    globalThis.crypto.randomUUID(),
  );

  const visibleItems = useMemo(
    () => filterItems(menu, activeCategoryId, search),
    [menu, activeCategoryId, search],
  );

  const discount = safeToPaise(discountInput);
  const { subtotal, discount, total } = billTotal(lines, discount);
  const discountExceedsSubtotal = discount > subtotal;

  const tendered = collectsTender(paymentMethod)
    ? safeToPaise(tenderedInput)
    : null;
  const changeDue =
    tendered !== null && tendered >= total ? tendered - total : null;

  const canSave =
    lines.length > 0 &&
    !discountExceedsSubtotal &&
    !isSaving &&
    (!collectsTender(paymentMethod) ||
      !tenderedInput.trim() ||
      (tendered ?? 0) >= total);

  const addBySearch = useCallback(() => {
    const match = topSearchMatch(menu, search);
    if (!match) return;
    addItem(match);
    setSearch("");
  }, [addItem, menu, search]);

  const resetForNextCustomer = useCallback(() => {
    clear();
    setDiscountInput("");
    setTenderedInput("");
    setPaymentMethod("CASH");
    setSearch("");
    setError(null);
    setPriceChange(null);
    setIdempotencyKey(globalThis.crypto.randomUUID());
  }, [clear]);

  const submit = useCallback(
    (expectedTotal: number) => {
      setError(null);
      startSaving(async () => {
        const result = await createBillAction({
          idempotencyKey,
          lines: lines.map((line) => ({
            itemId: line.itemId,
            quantity: line.quantity,
          })),
          discount: discount,
          paymentMethod,
          tendered: collectsTender(paymentMethod) ? tendered : null,
          expectedTotal,
        });

        if (result.ok) {
          toast.success(`Bill #${result.data.billNumber} saved`);
          resetForNextCustomer();
          router.push(`/print/${result.data.id}`);
          return;
        }

        if (result.error.code === "PRICE_CHANGED") {
          setPriceChange(result.error.message);
          return;
        }

        setError(result.error.message);
      });
    },
    [
      discount,
      idempotencyKey,
      lines,
      paymentMethod,
      resetForNextCustomer,
      router,
      tendered,
    ],
  );

  const save = useCallback(() => submit(total), [submit, total]);

  /**
   * The cashier accepted the recalculated total. Re-submitting with the same
   * idempotency key is safe — the first attempt never wrote anything.
   */
  const confirmPriceChange = useCallback(() => {
    setPriceChange(null);
    router.refresh(); // pull fresh prices into the menu
    submit(total);
  }, [router, submit, total]);

  const dismissPriceChange = useCallback(() => setPriceChange(null), []);

  return {
    categories: menu,
    activeCategoryId,
    setActiveCategoryId,
    search,
    setSearch,
    addBySearch,
    visibleItems,

    lines,
    addItem: (item: MenuItem) => addItem(item),
    setQuantity,
    removeItem,

    subtotal,
    discountInput,
    setDiscountInput,
    discount: discount,
    discountExceedsSubtotal,
    total,

    paymentMethod,
    setPaymentMethod,
    tenderedInput,
    setTenderedInput,
    changeDue,

    canSave,
    isSaving,
    error,
    priceChange,
    confirmPriceChange,
    dismissPriceChange,
    save,
  };
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0. The hook has no UI yet — Tasks 21–23 consume it.

---

### Task 21: Menu grid components

**Files:**
- Create: `src/components/pages/bill/components/CategoryTabs.tsx`, `ItemSearchBox.tsx`, `MenuItemCard.tsx`, `MenuGrid.tsx`

**Interfaces:**
- Consumes: `MenuCategory`, `MenuItem`, `formatINR`
- Produces: `<MenuGrid categories activeCategoryId onCategoryChange search onSearchChange onSearchEnter items onSelect />`

- [ ] **Step 1: Create the category tabs**

`src/components/pages/bill/components/CategoryTabs.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MenuCategory } from "@/types/item.types";

export function CategoryTabs({
  categories,
  activeCategoryId,
  onChange,
}: {
  categories: MenuCategory[];
  activeCategoryId: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant={activeCategoryId === null ? "default" : "outline"}
        size="sm"
        onClick={() => onChange(null)}
      >
        All
      </Button>
      {categories.map((category) => (
        <Button
          key={category.id}
          type="button"
          variant={activeCategoryId === category.id ? "default" : "outline"}
          size="sm"
          className={cn("shrink-0")}
          onClick={() => onChange(category.id)}
        >
          {category.name}
        </Button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the search box**

`src/components/pages/bill/components/ItemSearchBox.tsx`:

```tsx
"use client";

import { Search } from "lucide-react";
import { useEffect, useRef } from "react";

import { Input } from "@/components/ui/input";

export function ItemSearchBox({
  value,
  onChange,
  onEnter,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // A cashier is faster on the keyboard than the touchscreen, so the search
  // box owns focus on load. Spec §8.1.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder="Search items…  (Enter adds the top match, Esc clears)"
        className="pl-9"
        aria-label="Search menu items"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the item card**

`src/components/pages/bill/components/MenuItemCard.tsx`:

```tsx
"use client";

import Image from "next/image";

import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/utils/money";
import type { MenuItem } from "@/types/item.types";

export function MenuItemCard({
  item,
  onSelect,
}: {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
}) {
  const soldOut = !item.isAvailable;

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onSelect(item)}
      className={cn(
        "flex flex-col overflow-hidden rounded-lg border text-left transition",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        soldOut
          ? "cursor-not-allowed opacity-40"
          : "hover:border-primary hover:shadow-sm active:scale-[0.98]",
      )}
    >
      <div className="relative aspect-square w-full bg-muted">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="160px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl font-semibold text-muted-foreground">
            {item.name.charAt(0)}
          </div>
        )}
        {soldOut ? (
          <span className="absolute inset-x-0 bottom-0 bg-destructive px-2 py-0.5 text-center text-[10px] font-semibold uppercase text-destructive-foreground">
            Sold out
          </span>
        ) : null}
      </div>
      <div className="space-y-0.5 p-2">
        <p className="line-clamp-2 text-sm font-medium leading-tight">
          {item.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatINR(item.price)}
        </p>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: Create the grid**

`src/components/pages/bill/components/MenuGrid.tsx`:

```tsx
"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import type { MenuCategory, MenuItem } from "@/types/item.types";

import { CategoryTabs } from "./CategoryTabs";
import { ItemSearchBox } from "./ItemSearchBox";
import { MenuItemCard } from "./MenuItemCard";

export function MenuGrid({
  categories,
  activeCategoryId,
  onCategoryChange,
  search,
  onSearchChange,
  onSearchEnter,
  items,
  onSelect,
}: {
  categories: MenuCategory[];
  activeCategoryId: string | null;
  onCategoryChange: (id: string | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSearchEnter: () => void;
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
}) {
  return (
    <div className="flex h-full flex-col gap-4">
      <ItemSearchBox
        value={search}
        onChange={onSearchChange}
        onEnter={onSearchEnter}
      />
      <CategoryTabs
        categories={categories}
        activeCategoryId={activeCategoryId}
        onChange={onCategoryChange}
      />

      <ScrollArea className="flex-1">
        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            No items match “{search}”.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((item) => (
              <MenuItemCard key={item.id} item={item} onSelect={onSelect} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 5: Allow ImageKit images in Next config**

`next.config.mjs` — add the remote pattern now so Task 21's `<Image>` works once M4 adds real photos:

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "ik.imagekit.io" }],
  },
};

export default nextConfig;
```

- [ ] **Step 6: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

---

### Task 22: Cart and payment components

**Files:**
- Create: `src/components/custom/MoneyInput.tsx`
- Create: `src/components/pages/bill/components/CartLine.tsx`, `CartPanel.tsx`, `DiscountInput.tsx`, `PaymentPanel.tsx`, `PriceChangedDialog.tsx`

**Interfaces:**
- Consumes: everything `useBillPage` returns
- Produces: `<CartPanel />` and `<PriceChangedDialog />`, both driven entirely by props

- [ ] **Step 1: Create the money input**

`src/components/custom/MoneyInput.tsx`:

```tsx
"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Accepts only digits and at most one dot with two decimals, so the string
 * it produces is always safe for parseRupees(). Never converts to a number here.
 */
type MoneyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "value" | "onChange" | "type"
> & {
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
};

export function MoneyInput({
  value,
  onChange,
  invalid,
  className,
  placeholder = "0",
  ...rest
}: MoneyInputProps) {
  return (
    <Input
      inputMode="decimal"
      value={value}
      placeholder={placeholder}
      aria-invalid={invalid}
      className={cn(
        "text-right tabular-nums",
        invalid && "border-destructive focus-visible:ring-destructive",
        className,
      )}
      onChange={(event) => {
        const next = event.target.value;
        // Digits, optionally one dot and at most two decimals. Anything else
        // is silently rejected, so the string is always safe for parseRupees().
        if (next === "" || /^\d*(\.\d{0,2})?$/.test(next)) {
          onChange(next);
        }
      }}
      {...rest}
    />
  );
}
```

- [ ] **Step 2: Create the cart line**

`src/components/pages/bill/components/CartLine.tsx`:

```tsx
"use client";

import { Minus, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatINR, lineTotal } from "@/lib/utils/money";
import type { CartLine as CartLineType } from "@/types/bill.types";

export function CartLine({
  line,
  onSetQuantity,
  onRemove,
}: {
  line: CartLineType;
  onSetQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
}) {
  return (
    <li className="flex items-start gap-2 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{line.name}</p>
        <p className="text-xs text-muted-foreground">
          {formatINR(line.unitPrice)} each
        </p>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-7"
          aria-label={`Decrease ${line.name}`}
          onClick={() => onSetQuantity(line.itemId, line.quantity - 1)}
        >
          <Minus className="size-3" />
        </Button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums">
          {line.quantity}
        </span>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-7"
          aria-label={`Increase ${line.name}`}
          onClick={() => onSetQuantity(line.itemId, line.quantity + 1)}
        >
          <Plus className="size-3" />
        </Button>
      </div>

      <span className="w-20 text-right text-sm font-semibold tabular-nums">
        {formatINR(lineTotal(line.unitPrice, line.quantity))}
      </span>

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 text-muted-foreground"
        aria-label={`Remove ${line.name}`}
        onClick={() => onRemove(line.itemId)}
      >
        <X className="size-3" />
      </Button>
    </li>
  );
}
```

- [ ] **Step 3: Create the discount input**

`src/components/pages/bill/components/DiscountInput.tsx`:

```tsx
"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
import { Label } from "@/components/ui/label";

export function DiscountInput({
  value,
  onChange,
  invalid,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="discount" className="text-sm font-normal">
          Discount ₹
        </Label>
        <MoneyInput
          id="discount"
          value={value}
          onChange={onChange}
          invalid={invalid}
          disabled={disabled}
          className="w-28"
        />
      </div>
      {invalid ? (
        <p className="text-right text-xs text-destructive">
          Discount cannot be more than the subtotal.
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create the payment panel**

`src/components/pages/bill/components/PaymentPanel.tsx`:

```tsx
"use client";

import { MoneyInput } from "@/components/custom/MoneyInput";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  collectsTender,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { formatINR } from "@/lib/utils/money";

export function PaymentPanel({
  paymentMethod,
  onPaymentMethodChange,
  tenderedInput,
  onTenderedChange,
  changeDue,
  disabled,
}: {
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  tenderedInput: string;
  onTenderedChange: (value: string) => void;
  changeDue: number | null;
  disabled: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {PAYMENT_METHODS.map((method) => (
          <Button
            key={method}
            type="button"
            size="sm"
            variant={paymentMethod === method ? "default" : "outline"}
            disabled={disabled}
            onClick={() => onPaymentMethodChange(method)}
          >
            {PAYMENT_METHOD_LABELS[method]}
          </Button>
        ))}
      </div>

      {collectsTender(paymentMethod) ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="tendered" className="text-sm font-normal">
              Tendered ₹
            </Label>
            <MoneyInput
              id="tendered"
              value={tenderedInput}
              onChange={onTenderedChange}
              disabled={disabled}
              className="w-28"
            />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Change</span>
            <span className="font-semibold tabular-nums">
              {changeDue === null ? "—" : formatINR(changeDue)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Create the price-changed dialog**

`src/components/pages/bill/components/PriceChangedDialog.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Shown when the server's recalculated total disagrees with what the cashier
 * is looking at. Never charge a different amount than the screen shows.
 * Spec §8.3.
 */
export function PriceChangedDialog({
  message,
  onConfirm,
  onDismiss,
  isSaving,
}: {
  message: string | null;
  onConfirm: () => void;
  onDismiss: () => void;
  isSaving: boolean;
}) {
  return (
    <Dialog open={message !== null} onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prices changed</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onDismiss} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={isSaving}>
            {isSaving ? "Saving…" : "Charge the new total"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Create the cart panel**

`src/components/pages/bill/components/CartPanel.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { PaymentMethod } from "@/constants/payment-methods";
import { formatINR } from "@/lib/utils/money";
import type { CartLine as CartLineType } from "@/types/bill.types";

import { CartLine } from "./CartLine";
import { DiscountInput } from "./DiscountInput";
import { PaymentPanel } from "./PaymentPanel";

export function CartPanel({
  lines,
  onSetQuantity,
  onRemove,
  subtotal,
  discountInput,
  onDiscountChange,
  discountExceedsSubtotal,
  total,
  paymentMethod,
  onPaymentMethodChange,
  tenderedInput,
  onTenderedChange,
  changeDue,
  canSave,
  isSaving,
  error,
  onSave,
}: {
  lines: CartLineType[];
  onSetQuantity: (itemId: string, quantity: number) => void;
  onRemove: (itemId: string) => void;
  subtotal: number;
  discountInput: string;
  onDiscountChange: (value: string) => void;
  discountExceedsSubtotal: boolean;
  total: number;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  tenderedInput: string;
  onTenderedChange: (value: string) => void;
  changeDue: number | null;
  canSave: boolean;
  isSaving: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <aside className="flex h-full flex-col rounded-lg border bg-card">
      <header className="border-b px-4 py-3">
        <h2 className="font-semibold">Current bill</h2>
      </header>

      <ScrollArea className="flex-1 px-4">
        {lines.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Tap an item to start the bill.
          </p>
        ) : (
          <ul className="divide-y">
            {lines.map((line) => (
              <CartLine
                key={line.itemId}
                line={line}
                onSetQuantity={onSetQuantity}
                onRemove={onRemove}
              />
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="space-y-3 border-t px-4 py-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium tabular-nums">{formatINR(subtotal)}</span>
        </div>

        <DiscountInput
          value={discountInput}
          onChange={onDiscountChange}
          invalid={discountExceedsSubtotal}
          disabled={isSaving}
        />

        <Separator />

        <div className="flex items-center justify-between">
          <span className="text-lg font-semibold">Total</span>
          <span className="text-2xl font-bold tabular-nums">
            {formatINR(total)}
          </span>
        </div>

        <PaymentPanel
          paymentMethod={paymentMethod}
          onPaymentMethodChange={onPaymentMethodChange}
          tenderedInput={tenderedInput}
          onTenderedChange={onTenderedChange}
          changeDue={changeDue}
          disabled={isSaving}
        />

        {error ? (
          <div className="space-y-2 rounded-md bg-destructive/10 px-3 py-2">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full"
              onClick={onSave}
              disabled={isSaving}
            >
              Retry
            </Button>
          </div>
        ) : null}

        <Button
          type="button"
          size="lg"
          className="h-14 w-full text-base"
          disabled={!canSave}
          onClick={onSave}
        >
          {isSaving ? "Saving…" : "Save & Print"}
        </Button>
      </div>
    </aside>
  );
}
```

The **Retry** button reusing `onSave` is the whole point of the idempotency key: pressing it after a timeout cannot create a second bill. Spec §11.2.

- [ ] **Step 7: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: exit 0.

---

### Task 23: Assemble the billing page

**Files:**
- Create: `src/components/pages/bill/BillPage.tsx`
- Modify: `src/app/(app)/bill/page.tsx`

**Interfaces:**
- Consumes: `useBillPage`, `MenuGrid`, `CartPanel`, `PriceChangedDialog`, `getMenu`
- Produces: a working `/bill` route

- [ ] **Step 1: Create the page component**

`src/components/pages/bill/BillPage.tsx`:

```tsx
"use client";

import type { MenuCategory } from "@/types/item.types";

import { CartPanel } from "./components/CartPanel";
import { MenuGrid } from "./components/MenuGrid";
import { PriceChangedDialog } from "./components/PriceChangedDialog";
import { useBillPage } from "./hooks/useBillPage";

export function BillPage({ menu }: { menu: MenuCategory[] }) {
  const bill = useBillPage({ menu });

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_380px]">
      <MenuGrid
        categories={bill.categories}
        activeCategoryId={bill.activeCategoryId}
        onCategoryChange={bill.setActiveCategoryId}
        search={bill.search}
        onSearchChange={bill.setSearch}
        onSearchEnter={bill.addBySearch}
        items={bill.visibleItems}
        onSelect={bill.addItem}
      />

      <CartPanel
        lines={bill.lines}
        onSetQuantity={bill.setQuantity}
        onRemove={bill.removeItem}
        subtotal={bill.subtotal}
        discountInput={bill.discountInput}
        onDiscountChange={bill.setDiscountInput}
        discountExceedsSubtotal={bill.discountExceedsSubtotal}
        total={bill.total}
        paymentMethod={bill.paymentMethod}
        onPaymentMethodChange={bill.setPaymentMethod}
        tenderedInput={bill.tenderedInput}
        onTenderedChange={bill.setTenderedInput}
        changeDue={bill.changeDue}
        canSave={bill.canSave}
        isSaving={bill.isSaving}
        error={bill.error}
        onSave={bill.save}
      />

      <PriceChangedDialog
        message={bill.priceChange}
        onConfirm={bill.confirmPriceChange}
        onDismiss={bill.dismissPriceChange}
        isSaving={bill.isSaving}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace the placeholder route**

`src/app/(app)/bill/page.tsx`:

```tsx
import { BillPage } from "@/components/pages/bill/BillPage";
import { requireUser } from "@/lib/auth/guard";
import { getMenu } from "@/server/items/items-queries";

export const metadata = {
  title: "New Bill | Billing",
  description: "Ring up a customer and print a receipt.",
};

export default async function Page() {
  await requireUser();
  const menu = await getMenu();

  return <BillPage menu={menu} />;
}
```

The menu is fetched server-side once per load and passed down — no client fetching, no loading spinner on the till.

- [ ] **Step 3: Handle an empty menu**

If `getMenu()` returns nothing the grid is blank with no explanation. In `BillPage.tsx`, insert this early return immediately **after** the `useBillPage` call and before the main `return` — after, because React hooks must run unconditionally on every render:

```tsx
export function BillPage({ menu }: { menu: MenuCategory[] }) {
  const bill = useBillPage({ menu });

  // Hooks have already run, so an early return here is safe.
  if (menu.length === 0) {
    return (
      <div className="flex h-[calc(100vh-3.5rem)] items-center justify-center p-4">
        <p className="max-w-sm text-center text-muted-foreground">
          No items on the menu yet. The owner needs to add categories and items
          before billing can start.
        </p>
      </div>
    );
  }

  return (
    // …the grid from Step 1…
  );
}
```

- [ ] **Step 4: Verify the billing screen works end to end**

```bash
npm run dev
```

Sign in, then at `/bill`:

1. **Tap an item** — it appears in the cart at quantity 1.
2. **Tap the same item again** — quantity becomes 2, no duplicate line.
3. **Use `+` / `−`** — quantity changes; pressing `−` at 1 removes the line.
4. **Type `bur` and press Enter** — the first burger is added and the box clears.
5. **Press Esc** — the search box clears.
6. **Switch category tabs** — the grid filters; the cart is untouched.
7. **Enter a discount of `10`** — total drops by ₹10.
8. **Enter a discount larger than the subtotal** — the field turns red, an error appears, and Save is disabled.
9. **With CASH selected, enter a tendered amount** — change is calculated. Enter less than the total — Save is disabled.
10. **Select UPI** — the tendered and change fields disappear.
11. **Press Save & Print** — a success toast shows the bill number and the browser navigates to `/print/<id>` (a 404 until Task 24).

- [ ] **Step 5: Verify the saved bill in the database**

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`
  SELECT b.bill_number, b.business_date, b.subtotal, b.discount,
         b.total, b.payment_method, b.tendered, b.change_due, u.name
  FROM bills b JOIN users u ON u.id = b.created_by
  ORDER BY b.created_at DESC LIMIT 3\`);
console.table(r.rows);
process.exit(0);
"
```

Expected: your bill, with `total = subtotal - discount` and all values integers.

---

### Task 24: The 80mm print view

**Files:**
- Create: `src/app/print/[billId]/page.tsx`
- Create: `src/components/pages/print/ReceiptView.tsx`
- Create: `src/components/pages/print/components/Receipt80mm.tsx`, `Receipt58mm.tsx`, `AutoPrintTrigger.tsx`
- Create: `src/app/print/[billId]/print.css`

**Interfaces:**
- Consumes: `getReceipt` (Task 19), `ReceiptData`, `formatReceiptAmount`, `formatBillDate`, `formatBillTime`
- Produces: a shell-free `/print/[billId]` route that auto-prints at 80mm or 58mm per shop settings

- [ ] **Step 1: Create the print stylesheet**

`src/app/print/[billId]/print.css`:

```css
/* 80mm roll, 72mm printable. Spec §9. */
@page {
  size: 80mm auto;
  margin: 0;
}

@media print {
  html,
  body {
    width: 72mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
  }

  .no-print {
    display: none !important;
  }
}

.receipt {
  width: 72mm;
  margin: 0 auto;
  padding: 4mm 2mm;
  /* Monospace so the amount column aligns like a real receipt. */
  font-family: "Courier New", ui-monospace, monospace;
  font-size: 12px;
  line-height: 1.35;
  color: #000;
  background: #fff;
}

.receipt--58 {
  width: 50mm;
  font-size: 11px;
}

.receipt hr {
  border: none;
  border-top: 1px dashed #000;
  margin: 4px 0;
}

.receipt table {
  width: 100%;
  border-collapse: collapse;
}

.receipt td {
  padding: 1px 0;
  vertical-align: top;
}

.receipt .qty {
  width: 3ch;
  text-align: center;
}

.receipt .amt {
  width: 8ch;
  text-align: right;
  white-space: nowrap;
}
```

- [ ] **Step 2: Create the auto-print trigger**

`src/components/pages/print/components/AutoPrintTrigger.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export function AutoPrintTrigger() {
  useEffect(() => {
    // One frame so fonts and layout settle before the print dialog opens.
    const timer = window.setTimeout(() => window.print(), 300);
    return () => window.clearTimeout(timer);
  }, []);

  return null;
}
```

- [ ] **Step 3: Create the 80mm receipt**

`src/components/pages/print/components/Receipt80mm.tsx`:

```tsx
import { PAYMENT_METHOD_LABELS } from "@/constants/payment-methods";
import { formatBillDate, formatBillTime } from "@/lib/utils/dates";
import { formatReceiptAmount } from "@/lib/utils/money";
import type { ReceiptData } from "@/types/bill.types";

export function Receipt80mm({
  receipt,
  narrow = false,
}: {
  receipt: ReceiptData;
  narrow?: boolean;
}) {
  const { shop } = receipt;

  return (
    <div className={`receipt${narrow ? " receipt--58" : ""}`}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 700, fontSize: narrow ? 13 : 15 }}>
          {shop.name}
        </div>
        {shop.addressLine ? <div>{shop.addressLine}</div> : null}
        {shop.phone ? <div>Ph: {shop.phone}</div> : null}
      </div>

      <hr />

      <table>
        <tbody>
          <tr>
            <td>Bill #{receipt.billNumber}</td>
            <td className="amt">{formatBillDate(receipt.businessDate)}</td>
          </tr>
          <tr>
            <td>Cashier: {receipt.cashierName}</td>
            <td className="amt">
              {formatBillTime(receipt.createdAt, shop.timezone)}
            </td>
          </tr>
        </tbody>
      </table>

      <hr />

      <table>
        <tbody>
          <tr style={{ fontWeight: 700 }}>
            <td>ITEM</td>
            <td className="qty">QTY</td>
            <td className="amt">AMT</td>
          </tr>
        </tbody>
      </table>

      <hr />

      <table>
        <tbody>
          {receipt.lines.map((line, index) => (
            <tr key={`${line.itemName}-${index}`}>
              <td>{line.itemName}</td>
              <td className="qty">{line.quantity}</td>
              <td className="amt">{formatReceiptAmount(line.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr />

      <table>
        <tbody>
          <tr>
            <td>Subtotal</td>
            <td className="amt">{formatReceiptAmount(receipt.subtotal)}</td>
          </tr>
          {receipt.discount > 0 ? (
            <tr>
              <td>Discount</td>
              <td className="amt">
                -{formatReceiptAmount(receipt.discount)}
              </td>
            </tr>
          ) : null}
          <tr style={{ fontWeight: 700, fontSize: narrow ? 12 : 14 }}>
            <td>TOTAL</td>
            <td className="amt">{formatReceiptAmount(receipt.total)}</td>
          </tr>
          <tr>
            <td>Paid: {PAYMENT_METHOD_LABELS[receipt.paymentMethod]}</td>
            <td className="amt">
              {receipt.tendered === null
                ? formatReceiptAmount(receipt.total)
                : formatReceiptAmount(receipt.tendered)}
            </td>
          </tr>
          {receipt.changeDue !== null ? (
            <tr>
              <td>Change</td>
              <td className="amt">{formatReceiptAmount(receipt.changeDue)}</td>
            </tr>
          ) : null}
        </tbody>
      </table>

      <hr />

      {shop.receiptFooter ? (
        <div style={{ textAlign: "center" }}>{shop.receiptFooter}</div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Create the 58mm variant**

`src/components/pages/print/components/Receipt58mm.tsx`:

```tsx
import type { ReceiptData } from "@/types/bill.types";

import { Receipt80mm } from "./Receipt80mm";

/**
 * Same markup, narrower measure. Kept as a separate component so the two
 * layouts can diverge later without touching the caller.
 */
export function Receipt58mm({ receipt }: { receipt: ReceiptData }) {
  return <Receipt80mm receipt={receipt} narrow />;
}
```

- [ ] **Step 5: Create the receipt view**

`src/components/pages/print/ReceiptView.tsx`:

```tsx
import Link from "next/link";

import type { ReceiptData } from "@/types/bill.types";

import { AutoPrintTrigger } from "./components/AutoPrintTrigger";
import { Receipt58mm } from "./components/Receipt58mm";
import { Receipt80mm } from "./components/Receipt80mm";

export function ReceiptView({ receipt }: { receipt: ReceiptData }) {
  return (
    <>
      <AutoPrintTrigger />

      {receipt.shop.printerWidth === "MM_58" ? (
        <Receipt58mm receipt={receipt} />
      ) : (
        <Receipt80mm receipt={receipt} />
      )}

      <div className="no-print" style={{ padding: "16px", textAlign: "center" }}>
        <Link
          href="/bill"
          style={{ textDecoration: "underline", fontSize: 14 }}
        >
          Back to billing
        </Link>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Create the route**

`src/app/print/[billId]/page.tsx`:

```tsx
import { notFound } from "next/navigation";

import { ReceiptView } from "@/components/pages/print/ReceiptView";
import { requireUser } from "@/lib/auth/guard";
import { getReceipt } from "@/server/bills/bills-queries";

import "./print.css";

export const metadata = {
  title: "Receipt | Billing",
};

export default async function Page({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  await requireUser();

  const { billId } = await params;
  const receipt = await getReceipt(billId);

  if (!receipt) notFound();

  return <ReceiptView receipt={receipt} />;
}
```

This route sits **outside** the `(app)` group, so it inherits the providers-only root layout and renders with no navbar — exactly what spec §13.2 called for.

- [ ] **Step 7: Verify printing**

```bash
npm run dev
```

1. Create a bill at `/bill` with a discount and cash tendered.
2. Expected: `/print/<id>` loads and the browser's print dialog opens automatically within a second.
3. In the print preview, confirm:
   - Paper size shows as roughly 80mm wide (or set it manually if printing to PDF).
   - Shop name, address and phone are centred at the top.
   - Bill number and date are on one row; cashier and time on the next.
   - Item names, quantities and amounts align in columns.
   - Subtotal, Discount (negative), TOTAL, Paid and Change all appear.
   - The footer message is centred at the bottom.
   - The "Back to billing" link is **absent** from the print preview.
4. Cancel the dialog. Expected: the receipt renders on screen with the link visible.
5. Print to PDF and open it — confirm nothing is cut off on the right edge.

- [ ] **Step 8: Verify the 58mm variant**

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
await db.execute(sql\`UPDATE shop_settings SET printer_width = 'MM_58'\`);
console.log('switched to 58mm');
process.exit(0);
"
```

Reload the print page. Expected: a visibly narrower receipt with smaller text. Then switch back:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
await db.execute(sql\`UPDATE shop_settings SET printer_width = 'MM_80'\`);
process.exit(0);
"
```

---

### Task 25: Offline detection

**Files:**
- Create: `src/hooks/use-online-status.ts`, `src/components/custom/OfflineBanner.tsx`
- Modify: `src/app/(app)/layout.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `useOnlineStatus(): boolean`; `<OfflineBanner />` rendered in the authenticated shell

- [ ] **Step 1: Create the hook**

`src/hooks/use-online-status.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  // Assume online during SSR and the first paint; the listeners correct it.
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
```

- [ ] **Step 2: Create the banner**

`src/components/custom/OfflineBanner.tsx`:

```tsx
"use client";

import { WifiOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/use-online-status";

/**
 * The worst outcome in a shop is a cashier believing a bill saved when it
 * did not. This says so unambiguously. Spec §11.4.
 */
export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="alert"
      className="flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground"
    >
      <WifiOff className="size-4 shrink-0" />
      No internet connection — bills CANNOT be saved right now.
    </div>
  );
}
```

- [ ] **Step 3: Add it to the shell**

In `src/app/(app)/layout.tsx`, import the banner and render it directly above `<AppNavbar>`:

```tsx
import { OfflineBanner } from "@/components/custom/OfflineBanner";
```

```tsx
    <div className="flex min-h-screen flex-col">
      <OfflineBanner />
      <AppNavbar user={user} />
      <main className="flex-1">{children}</main>
    </div>
```

- [ ] **Step 4: Verify it appears**

```bash
npm run dev
```

Open `/bill`, then in Chrome DevTools → Network → set throttling to **Offline**.

Expected: the red banner appears immediately. Add items and press Save & Print — expected: the save fails, the error box appears with a **Retry** button.

Set throttling back to **No throttling**, then press **Retry**.

Expected: the banner disappears, the bill saves, and the browser navigates to the print view. Confirm only **one** bill was created:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`
  SELECT bill_number, total, created_at FROM bills
  ORDER BY created_at DESC LIMIT 5\`);
console.table(r.rows);
process.exit(0);
"
```

Expected: one new bill, not two. This is the idempotency key doing its job under a real failure.

---

### Task 26: Handover docs and M3 acceptance

**Files:**
- Create: `docs/printer-setup.md`, `docs/deployment.md`
- Create: `CLAUDE.md`

**Interfaces:**
- Consumes: everything built in M0–M3
- Produces: the documents handed to the client, and the project conventions file future work reads

- [ ] **Step 1: Write the printer setup guide**

`docs/printer-setup.md`:

```markdown
# Thermal Printer Setup

One-time setup on the till computer. Takes about five minutes.

## 1. Install the printer

Connect the thermal printer by USB and install the driver that came with it
(or download it from the manufacturer). Windows will list it under
**Settings → Bluetooth & devices → Printers & scanners**.

Print a test page from Windows before continuing. If that does not work,
nothing in the billing app will either.

## 2. Make it the default printer

**Settings → Bluetooth & devices → Printers & scanners** → click the thermal
printer → **Set as default**.

Turn OFF "Let Windows manage my default printer" at the bottom of that page,
otherwise Windows will silently switch it back.

## 3. Configure Chrome (do this once)

Open any receipt in the billing app. When the print dialog appears:

| Setting | Value |
|---|---|
| Destination | Your thermal printer |
| Paper size | 80mm x 297mm (or "Roll Paper 80mm") |
| Margins | None |
| Scale | 100% (Default) |
| **Headers and footers** | **UNCHECKED** |
| Background graphics | Unchecked |

Chrome remembers these settings per printer, so you only set them once.

**If "Headers and footers" stays checked**, every receipt prints with the page
URL and date across the top and bottom. This is the single most common setup
mistake.

## 4. Test

Create a real bill and print it. Check:

- Nothing is cut off on the right edge
- The item, quantity and amount columns line up
- There is no URL or page number printed
- The paper cuts (or tears) cleanly after the footer

## Switching to a 58mm printer

The owner can change this in the app under Settings → Printer width. No
reinstall is needed — pick **58mm** and print a test receipt.

## Troubleshooting

**Print dialog does not open automatically.** Chrome blocks automatic printing
if the page has not been interacted with. Press **Ctrl+P**.

**Receipt prints on A4.** The paper size in the Chrome print dialog is wrong.
Repeat step 3.

**Text is tiny or huge.** Scale is not at 100%. Repeat step 3.
```

- [ ] **Step 2: Write the deployment guide**

`docs/deployment.md`:

```markdown
# Deployment and Operations

## Stack

| Service | Plan | What it holds |
|---|---|---|
| Netlify | Starter (free) | The Next.js application |
| Neon | Free | Postgres — all sales data |
| ImageKit | Free | Item photos (from M4) |

## Deploying a change

```bash
npm run build          # confirm it compiles first
netlify deploy --build --prod
```

## Environment variables

Set in Netlify under **Site configuration → Environment variables**. The full
list is in `.env.template`. `AUTH_URL` must be the deployed URL, not localhost.

## Database migrations

```bash
npm run db:generate    # after changing src/db/schema/*
npm run db:migrate     # applies to whatever DATABASE_URL points at
```

**Always back up before a migration** (see below).

## Backups — READ THIS

Neon's free plan keeps only a short restore window. This database holds the
shop's entire sales ledger. If a table is dropped and nobody notices for a
week, the free plan will not get it back.

**Confirmed retention on our plan: _____ (fill in from the Neon console)**

Two mitigations:

1. **Monthly export.** The owner runs Settings → Export all data (built in M6)
   and keeps the CSV file somewhere off this machine.
2. **Before any schema change**, take a dump:

   ```bash
   pg_dump "$DATABASE_URL" -Fc -f backup-$(date +%Y%m%d).dump
   ```

   Restore with:

   ```bash
   pg_restore -d "$DATABASE_URL" --clean --if-exists backup-YYYYMMDD.dump
   ```

## Known free-tier behaviour

**The first request of the day is slow.** Neon suspends idle databases; the
first query takes 1–2 seconds to wake it. This is normal, not a fault. A paid
Neon plan removes it.

**Netlify Starter limits:** 100 GB bandwidth and 300 build minutes per month.
Both are far above this shop's needs.

## Upgrading to paid

No code changes required — environment variables only:

- Netlify Pro (~$19/mo) or Vercel Pro (~$20/mo)
- Neon Launch (~$19/mo) — removes autosuspend, extends the restore window
- ImageKit paid — only if photo storage ever exceeds 5 GB (it will not)
```

- [ ] **Step 3: Write the conventions file**

`CLAUDE.md`:

```markdown
# Fast Food Billing — Project Conventions

**Spec:** `docs/superpowers/specs/2026-08-23-fastfood-billing-design.md`
**Plans:** `docs/superpowers/plans/`

## Non-negotiables

1. **Money is integer paise.** Never a float, never `parseFloat`. The only
   division by 100 is inside `formatINR` / `formatReceiptAmount` for display.
2. **Every server action starts with `requireUser()` or `requireSuperadmin()`.**
   Middleware only redirects — server actions are publicly callable endpoints.
3. **The client never sends prices.** Bill payloads carry `{ itemId, quantity }`.
4. **Reports read `bill_items` snapshot columns.** Never join to `items` for a
   name or price — that would let a rename rewrite history.
5. **Never `DELETE` an item, category or user.** Set `is_active = false`.
6. **Inside `db.transaction`, only throw.** Returning from the callback commits.
   Validation that can fail belongs before the transaction opens.
7. **Drizzle uses `neon-serverless` with a `Pool`.** Never `neon-http` — it
   cannot do interactive transactions.

## Structure

`src/app/` is routing only — a `page.tsx` exports `metadata` and renders one
component from `src/components/pages/`. Page logic lives in
`hooks/use<Feature>Tab.ts`, not in the component. Table pages split into
`XTab.tsx`, `XColumns.tsx` and `hooks/useXTab.ts`.

`src/server/<domain>/` holds the data layer: `*-actions.ts` (thin: guard,
validate, delegate, return `ActionResult`), `*-queries.ts` (reads),
`*-service.ts` (logic).

## Naming

Components `PascalCase.tsx` · feature hooks `useItemsTab.ts` · global hooks
`use-debounce.ts` · `lib`/`server`/`db` files `kebab-case.ts` · types
`<domain>.types.ts`.

## Verification

There is no test framework — this was a deliberate client decision. Verify
with these instead:

```bash
npm run verify:money              # money and date arithmetic
npm run db:verify                 # CHECK constraints reject bad data
npm run db:verify-immutability    # triggers reject history rewrites
npm run verify:bill               # bill creation, idempotency, gapless numbers
npx tsc --noEmit && npm run build
```

Run all of them before deploying.
```

- [ ] **Step 4: Run the full M3 acceptance pass**

Every check must pass before this plan is complete.

```bash
npm run verify:money
npm run db:verify
npm run db:verify-immutability
npm run verify:bill
npx tsc --noEmit
npm run build
```

Expected: all six exit 0.

- [ ] **Step 5: Walk the whole flow as a cashier would**

```bash
npm run dev
```

1. Sign out, then sign in as the seeded superadmin.
2. Add three different items; adjust one quantity to 3.
3. Apply a ₹15 discount.
4. Select CASH, tender ₹500.
5. Confirm the change amount is correct.
6. Save & Print — check the bill number, then cancel the print dialog.
7. Click "Back to billing" — the cart is **empty and ready** for the next customer.
8. Repeat twice more.
9. Confirm bill numbers ran 1, 2, 3 for today with no gaps:

```bash
npx tsx --env-file=.env.local -e "
import { sql } from 'drizzle-orm';
import { db } from './src/db';
const r = await db.execute(sql\`
  SELECT b.business_date, b.bill_number, b.total, b.payment_method,
         (SELECT count(*)::int FROM bill_items bi WHERE bi.bill_id = b.id) AS lines
  FROM bills b ORDER BY b.business_date, b.bill_number\`);
console.table(r.rows);
const c = await db.execute(sql\`SELECT * FROM bill_counters\`);
console.table(c.rows);
process.exit(0);
"
```

Expected: contiguous `bill_number` values per `business_date`, every bill with
at least one line, and `last_number` matching the highest bill number for each
date.

- [ ] **Step 6: Deploy and verify in production**

```bash
netlify deploy --build --prod
```

On the deployed URL: sign in, create one real bill, print it. Expected: works
identically to local, with a 1–2 second delay on the first request while Neon
wakes.

- [ ] **Step 7: Fill in the backup retention value**

Open the Neon console, find the plan's history retention setting, and replace
the `_____` blank in `docs/deployment.md`. Spec §16.1 requires this be a real
confirmed number rather than an assumption.

---

## Plan 1 complete

At this point the shop can take orders, apply discounts, accept cash or
digital payment, save an immutable audit-grade bill, and print an 80mm
receipt. Bills cannot be duplicated by a double-tap, cannot be silently
rewritten, and their numbering is gapless.

**Plan 2 (M4–M7)** covers item and category management with image upload,
the dashboard and reports with CSV export, the bills ledger and reprint, user
and settings administration, the audit log viewer, export-all-data, and final
polish before handover.
