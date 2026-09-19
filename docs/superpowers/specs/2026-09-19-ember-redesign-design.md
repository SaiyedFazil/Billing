# Ember Redesign — Design Spec

**Status:** approved 2026-09-19
**Visual source of truth:** Claude Design canvas "Billing — Ember redesign"
<https://claude.ai/artifact/QzWRBUhPNx2xDJtJaukSiV> (artboards: New bill, Dashboard,
Sign in, Bills, Sales, Items, Ember style guide, Sidebar component).

## Goal

Replace the default grayscale shadcn look with a warm, food-branded, professional
visual language ("Ember") across every screen, **without changing behaviour**.
Hooks, server actions, queries, money handling, guards and the printed receipt
are out of scope and must not change.

## Root-cause fix

`globals.css` declared `--font-sans: var(--font-sans)` (self-reference), so the
Geist font never applied and the app rendered in Times New Roman. The font
variables are rewired to the `next/font` CSS variables.

## Visual language

| Token | Value | Use |
|---|---|---|
| Espresso | `#1C1714` | sidebar, hero stat cards |
| Tomato 600 | `#D1431B` | primary buttons (4.6:1 with white) |
| Tomato 500 | `#F2542D` | highlights, chart "today", focus ring, selected border |
| Tomato 50 | `#FCEBE4` | selected / soft fills |
| Tomato 700 | `#A93212` | text on soft tomato, links |
| Cream | `#FAF7F2` | page canvas |
| Paper | `#FFFFFF` | cards |
| Line | `#ECE5DB` / input `#E3DBCF` | borders |
| Ink | `#1C1917` | text |
| Stone | `#6F665E` | secondary text (≥4.5:1 on cream) |
| Basil | `#1F8A55` (soft `#E4F3EA`, text `#17683F`) | success, change due, available |
| Mustard | `#E9A23B` (soft `#FDF0D5`, text `#8A5A0B`) | chart 2, warning/locked |
| Chilli | `#B42318` (soft `#FEE4E2`, text `#9F1C13`) | void, destructive |

Payment colours are fixed app-wide: Cash = tomato, UPI = mustard, Card = basil,
Other = stone. Category tiles cycle tomato → mustard → basil → plum → sky → rose
by the category's position in the menu.

**Type:** Bricolage Grotesque (display — page titles, card titles, money
totals, KPIs), Geist (UI/body), Geist Mono (bill numbers, usernames). All via
`next/font/google`. **Radius:** 12px controls, 20px cards, pills fully round.

## Shell

- `(app)/layout.tsx` renders `AppShell`: a dark espresso **sidebar** (256px) with
  the flame mark + shop name (from `shop_settings`; `logo_url` has no upload UI
  yet, so it is not shown), a tomato "New bill" button, grouped nav
  (Insights: Dashboard, Bills, Sales, What's selling · Manage (owner only):
  Items, Categories, Accounts, Settings, Audit) and a user card with sign-out.
- On `/bill` the sidebar collapses to a 76px **icon rail** so the POS gets width.
- Below `lg`, the sidebar is replaced by a slim top bar + slide-out drawer.
- `OfflineBanner` stays at the very top, full width.
- The shell reads the shop name. A failure there must not break the app — it
  falls back to "Billing".

## Screens

- **Sign in** — split screen (dark brand panel with the receipt illustration and
  headline; form on cream). Brand panel hidden below `lg`. Static: no DB read.
- **New bill** — search (Enter/Esc hints), category chips with colour dot and
  count, menu cards with tinted letter tile or photo, "in cart" ring + ×qty
  badge, sold-out state. Cart is a ticket: header with item count, two-row lines
  (name/total, unit price/stepper/remove), perforated divider, subtotal,
  discount, large total, icon payment buttons, tendered + green change box, and
  a 60px "Save & Print".
- **Dashboard** — eyebrow date, "Today" title, New bill shortcut, KPI row with
  espresso hero Sales card, 7-day bar chart (past bars light tomato, today bar
  tomato), top sellers with rank badges and share bars.
- **Tables (Bills, Sales, What's selling, Items, Categories, Accounts, Audit)** —
  shared `PageHeader`, filters in a toolbar card, tables inside a rounded card
  with a cream uppercase header row, status pills with dots.
- **Sales** — segmented range presets, KPI trio (hero net takings), day table
  with tinted total row, payment breakdown with stacked share bar.
- **Settings, Bill details, dialogs, error / not-found** — restyled with the
  same tokens and `PageHeader`.

## Constraints

- No `number` enters a money path. Chart heights and the payment share bar
  convert to `Number` **for display only**, as `SalesTrendChart` already does.
- Every page keeps its `requireUser()` / `requireSuperadmin()` call.
- `/print/[billId]` and `receipt.css` are untouched (thermal printer).
- Existing prop contracts of hooks are unchanged; components may receive new
  derived display props (e.g. cart quantities by item id).

## Verification

`npm run verify:offline` (typecheck + lint + money/retry/report checks) and
`npm run build` must pass. Manual pass of every screen in the browser at desktop
and phone widths.
