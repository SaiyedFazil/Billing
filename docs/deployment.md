# Deployment and Operations

## Stack

| Service  | Plan           | Holds                     |
| -------- | -------------- | ------------------------- |
| Netlify  | Starter (free) | The Next.js application   |
| Neon     | Free           | Postgres — all sales data |
| ImageKit | Free           | Item photos (from M4)     |

Netlify Starter is used rather than Vercel Hobby because **Vercel's Hobby plan
prohibits commercial use** and this is paid client work. Netlify's Starter plan
permits it.

## First-time setup

```bash
# 1. Create a Neon project at https://console.neon.tech
#    Copy the POOLED connection string (it must contain "-pooler").

# 2. Fill in .env.local
cp .env.template .env.local
# paste DATABASE_URL, set SEED_SUPERADMIN_PASSWORD
npx auth secret          # if AUTH_SECRET is not already set

# 3. Create the schema and seed
npm run db:migrate
npm run db:seed

# 4. Confirm everything works
npm run verify:all
```

## Deploying

```bash
npm run build                    # confirm it compiles first
netlify deploy --build --prod
```

First deploy:

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:import .env.local
netlify env:set AUTH_URL https://YOUR-SITE.netlify.app
netlify deploy --build --prod
```

`AUTH_URL` must be the deployed origin in Netlify, not `localhost`. Leave
`.env.local` pointing at localhost for development.

## Database migrations

```bash
npm run db:generate    # after changing src/db/schema/*
npm run db:migrate     # applies to whatever DATABASE_URL points at
```

**Always back up before a migration** — see below.

### The hand-written trigger migration

`0001_immutability_triggers.sql` is written by hand because drizzle-kit does
not generate triggers. It has a matching `meta/0001_snapshot.json` so the
migration chain stays intact. **Do not delete either file**, and if you ever
regenerate migrations from scratch, re-create both.

## Loading the menu card

The shop's printed menu card is transcribed in
`scripts/menu-import/menu-card-2026-08-11.ts`. Load it into whatever
`DATABASE_URL` points at:

```bash
npm run db:import-menu -- --dry-run   # show what it would add; writes nothing
npm run db:import-menu                # add it
```

It only ever adds. A category or item already on the menu — matched by name in
any category, ignoring case, spacing and punctuation — is skipped and left as
it is, so running it again adds nothing. A line marked `!` is on the menu with
a different price or category from the card; correct it in Administration >
Items if the card is right.

The sample menu from `db:seed` (Veg Burger, Peri Peri Fries, Coke Small, …) is
not the shop's. Retire it in Administration > Items first, otherwise the card's
Peri Peri Fries is skipped as a duplicate of the sample one. Retiring it later
and running the import again also works.

For a new menu card, add a file beside the current one and point
`scripts/import-menu.ts` at it.

## Backups — read this

Neon's free plan keeps only a short restore window. This database holds the
shop's entire sales ledger. If a table is dropped and nobody notices for a
week, the free plan will not get it back.

> **Confirmed history retention on our Neon plan: _____**
> (Fill this in from the Neon console → Project settings. Do not guess.)

Two mitigations:

1. **Monthly export.** The owner runs Settings → Export all data (built in M6)
   and keeps the CSV somewhere off this machine.
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
first query takes 1–2 seconds to wake it. This is normal, not a fault. The app
retries once automatically on a cold-start connection failure
(`src/db/with-connection-retry.ts`). A paid Neon plan removes the suspend.

**Netlify Starter limits:** 100 GB bandwidth and 300 build minutes per month.
Both are far above this shop's needs.

## npm audit

`npm audit` reports moderate advisories in `drizzle-kit`'s transitive `esbuild`
dependency. These are **dev-only** — drizzle-kit is a devDependency and the
advisory concerns esbuild's dev server, which this project never runs.
`npm audit fix --force` would downgrade drizzle-kit to 0.18.1, which is
incompatible. Do not run it.

## Upgrading to paid

No code changes required — environment variables only:

- Netlify Pro or Vercel Pro for hosting
- Neon Launch — removes autosuspend, extends the restore window
- ImageKit paid — only if photo storage ever exceeds 5 GB (it will not)
