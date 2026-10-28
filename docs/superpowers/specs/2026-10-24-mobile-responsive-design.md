# Mobile Responsive — Design

Date: 2026-10-24 · Status: approved by the owner, 2026-10-27

Makes every screen of the app work properly on a phone and a tablet, for
both the owner and the cashier, without changing how anything behaves and
without changing how anything looks on a laptop or desktop.

## 1. Intent

The app was built for the Windows till and the owner's computer. The client
now uses it on phones as well, mostly Android and sometimes iPhone, and
expects to do everything there: ring up and print bills, look up past bills,
read the reports, keep the cash book, and manage the menu, accounts and
settings.

Parts of the app already work on a phone. Below 1024px there is an espresso
top bar with a menu button that opens the sidebar as a drawer; dialogs shrink
to the screen; most toolbars wrap; the Cash book's expense table folds its
less important columns under the category; the Cash book's days table pins
its date column. Everything else was laid out for a wide screen, and it shows:

- **The till.** Below 1024px the bill panel sits _under_ the whole menu. To
  reach Save & Print, the cashier scrolls past every item on the menu. The
  search box takes focus on load, which on a phone pops the keyboard up over
  half the screen.
- **Tables.** Eight tables scroll sideways. The Bills table is about 900px
  wide, so on a 360px phone the total and status are off-screen.
- **Filters and forms.** Filter fields have fixed widths (`w-40`, `w-44`,
  `w-52`); some dialogs keep two fields side by side at 360px; many
  buttons are 32–36px tall, under the 40px a finger needs.
- **Printing.** After Save & Print the receipt page calls `window.print()`
  once. On a phone there is no Ctrl+P, so if that print sheet is dismissed or
  blocked there is no way to print again, and "Back to billing" is a small
  text link.

Success means: on a 360px Android phone and on an iPhone, the owner and the
cashier can do everything they can do at the till, comfortably with one
thumb, with nothing cut off and no sideways scrolling except in the two places
built to scroll (§7.8, §7.9). On a laptop or desktop, nothing has moved by a
single pixel.

## 2. Goals

1. Every page and dialog works at every width from 360px up, as owner and as
   cashier.
2. The till is fast on a phone: tap items, see the running total, open the
   bill, take payment, Save & Print.
3. Every value and every action the desktop shows can be reached on a phone,
   either directly or in a "⋯" menu.
4. Tablets (768–1023px) get a layout that uses their width, not a stretched
   phone layout.
5. Receipts print from an Android phone over Wi-Fi or Bluetooth, and from an
   iPhone to an AirPrint printer, through the same print flow as today.
6. It looks and feels professional: consistent spacing, 40px touch targets,
   no clipped text, no layout jumps.

## 3. Non-goals

- **Any change to logic or data.** No server action, query, service, schema,
  validation or money path changes. Hooks change only where a phone layout
  needs new UI state (§7.1) and for the installed app's same-tab reprint
  (§7.17).
- **Any change at 1024px and wider.** See §4.
- **Direct Bluetooth printing** that skips the print dialog (Web Bluetooth or
  ESC/POS commands sent from the browser). That is a separate project.
- **A native app,** an offline mode, or changes to the PWA manifest.
- **A dark theme** (Ember is light only).
- **Redesigning the receipt.** The thermal receipt (`print/` components and
  `receipt.css`) stays as it is; only the screen-only buttons around it change.
- **Layouts made specially for phones held sideways.** Landscape phones get the
  phone layout and must work, but get no separate design.

## 4. Constraints

**Desktop is frozen.** At 1024px and wider, where the sidebar appears, every
page must look and behave exactly as it does today. Extra elements that are
hidden at that width (a phone-only "⋯" menu, a folded second line) are
fine; anything visible must render identically. In practice this means:

- New phone and tablet styles go in `max-lg:`, `max-md:` or `max-sm:`
  variants, or in base classes whose current value comes back at `lg:`
  (`w-full lg:w-40`). The codebase already does this (`max-lg:hidden` on the
  Dashboard's New bill button, `max-lg:sticky` in `CashBookDaysTable`).
- Behaviour that changes on a phone is gated on the viewport being below
  1024px. Pointer type (`pointer-coarse:`) is never enough on its own: the
  till may be a touchscreen PC, and its behaviour must not change.
- Desktop is checked with before/after screenshots (§9).

**The project rules all still hold** (`CLAUDE.md`): money stays a decimal
string and is shown with `formatINR()`; every page and action keeps its
guard; Ember tokens, not hex; Prettier sorts classes; no new test framework.

**One component, one state.** A phone layout is the same component styled
differently, never a second copy. In particular, there is exactly one
`CartPanel` in the DOM: two would duplicate the `discount`, `tendered` and
`cash-given` ids and risk the two drifting apart.

**No layout flash on load.** Layout is decided by CSS, so the server-rendered
page is already right for the screen it lands on. JavaScript may add
behaviour after hydration (opening a sheet, `inert`), but never decides what
a phone sees on first paint.

## 5. Screen sizes

| Range         | Name    | Tested at                     | Layout                               |
| ------------- | ------- | ----------------------------- | ------------------------------------ |
| 360–639px     | Phone   | 360×640, 390×844, 412×915     | Top bar + drawer; one column         |
| 640–767px     | Large   | 640×900                       | As phone, with some two-column grids |
| 768–1023px    | Tablet  | 768×1024                      | Top bar + drawer; till side by side  |
| 1024px and up | Desktop | 1024×768, 1366×768, 1920×1080 | **Unchanged**                        |

These are Tailwind's default `sm` (640), `md` (768) and `lg` (1024)
breakpoints. Nothing new goes in `globals.css` for them.

## 6. Shared foundations

Done first, because most pages are fixed by fixing these.

**6.1 Viewport.** Add a `viewport` export to `src/app/layout.tsx`:
`themeColor: "#1c1714"` (the `--sidebar` colour, as in `manifest.ts`), so
Android's browser bar blends into the top bar; and
`interactiveWidget: "resizes-content"`, so on Android the layout shrinks
when the keyboard opens and `dvh`-sized dialogs and sheets stay above it.
Neither has any effect on a desktop. iPhone Safari ignores
`interactiveWidget`; there the focused field must still scroll into view
(checked in §9).

**6.2 Shell.** The top bar and drawer stay. Changes:

- On `/bill` the top bar's New bill button is hidden: it links to the page
  you are on and does nothing there.
- Drawer controls reach 40px (the sign-out button is 36px).
- The page leaves room for the iPhone home indicator where something is
  pinned to the bottom (§7.1), using `env(safe-area-inset-bottom)`.

**6.3 Touch targets.** Below 1024px, everything tappable is at least 40px
tall and wide: `Button` sizes `sm`, `icon` and `icon-sm`, the dialog close
button, `SelectTrigger size="sm"`, the date-range preset chips, the cart's
plus, minus and remove buttons, and table row actions. The recommended way
is to add `max-lg:` sizes to the `button.tsx` and `select.tsx` variants
once, rather than at each call site; the builder chooses.

**6.4 Page header.** On a phone the actions drop below the title (this
already happens through `flex-wrap`). A page with more than two header
actions keeps its primary action as a button and moves the rest into a
"⋯ More" menu on phones. Only the Cash book has three.

**6.5 Filter bars.** Below `sm`, fixed-width fields fill the width: a
two-column grid for pairs (From | To, Cashier | Payment) and full width for
single fields. All filters stay visible; none are hidden behind a Filters
button.

**6.6 Tables.** Below 1024px, no table scrolls sideways except the Cash
book's days table and the expense spreadsheet (§7.8, §7.9). Every other
table uses the pattern the Cash book's expense table already has:

- The column definitions mark low-priority columns `hidden <bp>:table-cell`,
  on the header and on the cell.
- Their values fold into the row's main cell as a second, muted line, so the
  row reads as a two-line list item: what it is on the left, the amount (or
  key figure) on the right.
- Row actions that are a row of icon buttons on desktop become one "⋯" menu
  on phones, with each action labelled in words. A reason that desktop shows
  only as a hover `title` ("Turn on stock tracking in Edit") becomes visible
  text in that menu.
- Each table chooses the width at which it folds (`sm`, `md` or `lg`), as
  wide as it needs so that it never scrolls sideways at that width.

**6.7 Paging footers.** The three "Showing 1–25 of 300 · Previous · Next"
footers (Bills, Cash book expenses, spreadsheet) wrap cleanly at 360px
with 40px buttons. Pulling them into one shared component is allowed but not
required.

**6.8 Dialogs.** They stay centred cards; they already fit the screen.
Below `sm`: padding drops from `p-6` to `p-5` (the footer's negative margins
follow), and any two-fields-side-by-side row stacks. Footer buttons are
already full width and stacked on phones.

**6.9 Amounts are never cut off.** Below 1024px, no amount is ever
truncated with an ellipsis. Where a big figure would not fit (a `StatCard`
in a narrow column, the till's total), the type gets smaller on narrow
screens. At exactly 1024px a six-figure `StatCard` value can already be cut
off today; §4 wins, so that stays as it is and is raised with the owner as a
separate fix.

**6.10 Text fields stay at 16px** below `md` (they already are), so iPhone
Safari does not zoom in when one is focused. New fields keep this.

## 7. Page by page

### 7.1 The till (`/bill`)

**Phone (below 768px).**

- The menu fills the screen. Search and the category chips stick under the
  top bar while the menu scrolls.
- The search box does not take focus on load when the viewport is below
  1024px _and_ the device has no mouse or trackpad at all
  (`(any-pointer: fine)` does not match), so the keyboard stays down. On the
  till, and on any narrow PC with a mouse, it keeps focus exactly as now
  (spec §8.1).
- A bar fixed to the bottom of the screen shows the bill at a glance: item
  count, total and a "View bill" button. It is always there, so nothing
  jumps when the first item goes on; with no items it reads "No items yet"
  and does not open. The menu's last row is not hidden behind it.
- Tapping the bar slides the bill up as a bottom sheet over a dimmed menu:
  lines with + / −, discount, total, payment method, tendered / change or
  split lines, and Save & Print. This is the existing `CartPanel`, styled as
  a sheet on phones (§4: one instance).
- The sheet behaves like a dialog: focus moves into it, Escape and the
  dimmed area close it, the menu behind is `inert`, focus returns to the bar
  on close. Android's back gesture closes the sheet instead of leaving the
  till (which would throw the cart away): opening pushes a history entry on
  the same URL and back pops it. This is required, not optional: in the
  installed app (§7.17) back with no history closes the app.
- The sheet is at most about 90% of the screen height. With the keyboard
  open on a 360×640 screen, the field being typed in and Save & Print can
  always be reached by scrolling inside the sheet.
- After a successful save the app goes to the receipt as it does now; the
  sheet does not need to close first.
- The price-changed dialog opens on top of the sheet and works as now.

**Tablet (768–1023px).** Menu and bill sit side by side, as on desktop: the
bill is a column of about 320px pinned to the screen height under the top
bar, and the menu grid shows as many columns as fit. No bottom bar.

**Desktop.** Unchanged: the 76px icon rail, the 360 / 404px bill column, the
keyboard hints.

### 7.2 Dashboard

KPI cards, the 7-day chart, Top sellers and Stock alerts already stack. Check
that the chart's labels fit at 360px (the card padding may drop to `p-4`)
and that tapping a bar shows its tooltip; apply §6.9 to the KPI values.

### 7.3 Bills, bill details and bill preview

- Toolbar per §6.5.
- Table per §6.6. On a phone a row shows the bill number (with a Void badge
  when voided) and the date, cashier and item count beneath; on the right
  the total and the payment method. "Completed" may be left out of the
  phone row because it is the normal state; Void never is. The preview button
  stays at the row's end.
- Bill details: the items table folds the unit price under the item name on
  phones, and long names wrap instead of pushing the table wider.
- The preview dialog's receipt already fits a phone; check it does.

### 7.4 Sales report

Date-range bar per §6.5: the presets fill the width, From and To are two
equal columns underneath. Three KPIs per §6.9. The daily table folds bills
and discount under the date. The payment breakdown card already stacks.

### 7.5 What's selling

The table folds the category and the share bar under the item name; quantity
and revenue stay on the right.

### 7.6 Cash book

Header actions per §6.4: Add expense stays a button; Export CSV and
Categories go in the "⋯ More" menu on phones. The view tabs, the date bar,
the KPIs and the "Open spreadsheet" row must not overflow at 360px. The
expense table already folds; check it at 360px. The expense, categories and
cancel dialogs per §6.8.

### 7.7 Items

- Toolbar: search full width, the two filters side by side beneath.
- The stock tiles already hide their icons on phones; check they fit at
  360px.
- Table per §6.6. On a phone a row shows the thumbnail, the name, and the
  category and price beneath; on the right the stock badge and the
  Available switch, which stays in the row because it is used every day.
  Update stock, Edit and Remove go in the "⋯" menu. Sort order folds into
  the second line.
- Item dialog: the category / price and order / available rows stack below
  `sm`; the image uploader and the stock tracking section fit at 360px.
- Update stock dialog: its tabs, fields and history list fit at 360px.

### 7.8 Cash book — days view

This table is meant to scroll sideways, with the date pinned (already
built). Check it at 360px; no change expected.

### 7.9 Expense spreadsheet

A spreadsheet is meant to scroll sideways, so the grid keeps doing that. On
phones, the row-number column also stays pinned on the left while scrolling,
the period bar and toolbar follow §6.5, and the footer (rows per page,
Previous, Next) wraps cleanly.

### 7.10 Categories

The table folds sort order and item count under the name; Edit and Remove
go in the "⋯" menu on phones. The dialog per §6.8.

### 7.11 Accounts

The table folds the username, role and bill count under the name; the status
badge stays on the right; Reset password and Deactivate / Reactivate go in
the "⋯" menu. The create, reset-password and confirm dialogs per §6.8.

### 7.12 Settings

The form already goes to one column below `lg` and two at `sm`. Check the
payment methods card, the export card and the business-day row at 360px, and
the receipt preview dialog.

### 7.13 Audit log

Removed. The owner asked for the audit log to be taken out of the app
entirely (2026-10-27); that work lands before this one, so there is no
Audit page to make responsive.

### 7.14 Login

Already has a phone layout (the brand panel is hidden below `lg`). Check the
form with the keyboard open on both phones.

### 7.15 Receipt page (`/print/[billId]`)

The receipt itself is unchanged. Below 1024px, the screen-only area under it
(already `no-print`) becomes two full-width buttons: **Print** (calls
`window.print()` again) and **Back to billing**. Print is needed because a
phone has no Ctrl+P, and iPhone Safari may refuse the automatic print once
the tap that started Save & Print is a few seconds old. On a desktop the area
is unchanged.

On phones, Back to billing replaces the receipt's history entry rather than
adding one, so the back gesture from the till does not land on the receipt
and print it again automatically.

### 7.16 Error and not-found pages

`AppErrorScreen`, `not-found.tsx` and `global-error.tsx`: check at 360px.

### 7.17 Installed on the home screen

Phones open the app both ways (client, 2026-10-27): in a Chrome or Safari
tab, and installed to the home screen from the existing manifest
(`display: "standalone"`, `start_url: "/bill"`). The installed app has no
address bar, reload or browser menu, and differs in four ways that matter:

- **Every way out is on the page.** The receipt page's Print and Back to
  billing buttons (§7.15) are the only way to print again or leave.
- **Reprint from the Bills list stays in the same tab.** The preview's
  Reprint opens the receipt in a new tab. An installed iPhone app sends that
  tab to Safari, which has separate cookies, so the cashier lands on the
  login page. When the app runs installed (`(display-mode: standalone)`)
  and the viewport is below 1024px, the preview's Reprint goes to the
  receipt in the same tab, as Reprint on the bill details page already does.
  Elsewhere it is unchanged.
- **Back closes the app** when there is no history, so the till's sheet must
  own the back gesture (§7.1).
- **iPhone home indicator.** If on a device the bottom bill bar sits under
  the home indicator in the installed app, add `viewportFit: "cover"` to the
  viewport (§6.1) and pad the top bar and bottom bar with the
  `env(safe-area-inset-*)` values. The builder decides from the device test.

iPhone printing from the installed app must be tried on a real iPhone.
If `window.print()` does nothing there, the printer guide (§8) says so and
tells iPhone users to print from a Safari tab.

## 8. Printing from a phone

No code changes beyond §7.15: the receipt page already sets the paper size
with `@page`, and phone browsers print through the phone's own print system.

- **Android.** Chrome's print preview prints to any printer that has an
  Android print service. A Wi-Fi or Bluetooth thermal printer needs one,
  usually the printer maker's app from the Play Store, or a general one for
  thermal printers such as RawBT. The client should check that the printer
  they buy works with one before buying.
- **iPhone.** Safari prints only to AirPrint printers. If iPhones must
  print, the printer must list AirPrint support. Otherwise iPhone users can
  do everything except print; the bill can be reprinted later from an Android
  phone or the till.

`docs/printer-setup.md` gets a "Printing from a phone" section: pairing or
joining Wi-Fi, installing the print service, the print preview settings
(paper size 80mm or 58mm, margins none, no headers and footers), a test
print, and the iPhone note.

## 9. Verification

Per page, before its commit:

1. `npm run typecheck` and `npm run lint` (CLAUDE.md), and `format:check`.
2. **Desktop unchanged:** screenshots of the page at 1024×768, 1366×768 and
   1920×1080, before any work starts (a baseline from the branch point) and
   after the change, compared pixel by pixel. Both runs use the same database
   and fixed dates in the URL, so the data matches; any difference is a bug.
   Playwright, run from outside the project so nothing is added to
   `package.json`, is the expected tool.
3. **Phone and tablet:** screenshots at 360×640, 390×844, 412×915 and
   768×1024, signed in as owner and as cashier: nothing clipped, no sideways
   scroll (except §7.8, §7.9), every action reachable.
4. Dialogs on the page opened at 360px, including with the keyboard open.

At the end: `npm run verify:offline` and `npm run build`. Then the owner
tries it on a real Android phone and a real iPhone, each both in a browser
tab and installed to the home screen: a full bill through Save & Print, a
reprint from the Bills list, an expense, an item edit.

That test runs on a **Netlify deploy preview** of the feature branch
(client, 2026-10-27), because the till needs HTTPS: `crypto.randomUUID()`,
which makes the bill key, only exists on HTTPS or localhost, so plain http
to this PC over Wi-Fi would crash the till. Before the test, the owner
confirms the preview's `DATABASE_URL` is the development database, and that
sign-in works on the preview's address (`AUTH_URL`; see
`docs/deployment.md`).

Saving bills is part of testing the till, and a saved bill can never be
deleted. The database in `.env.local` is a development database (client,
2026-10-27), so test bills may be saved there. No check is ever run against
the live shop database.

**Accounts for testing.** The owner signs in with the `SEED_SUPERADMIN_*`
values in `.env.local`, read by the script and never printed. A test cashier
account is created on the test database for the cashier runs.

**Branch.** The work goes on `feature/mobile-responsive`, cut from `test`
(which holds every merged feature, including split payment and the
spreadsheet), and merges back into `test` like the features before it. The
audit log removal is merged into `test` first and this branch is rebased
onto it, so the desktop baseline already has no Audit page.

## 10. Decisions

**The client's:**

- Every feature works on phones, for the owner and the cashier.
- Phones are mostly Android, sometimes iPhone.
- The shop will buy a thermal printer with both Wi-Fi and Bluetooth.
- Laptop and desktop screens must not change.
- The order of work: shared pieces, then the till, then page by page.
- Test bills may be saved on the development database in `.env.local`.
- Phones use the app both in a browser tab and installed to the home screen
  (§7.17).
- The real-phone test runs on a Netlify deploy preview against the
  development database (§9).
- The audit log is removed from the app and the database before this work
  (§7.13).
- Testing uses the Playwright already installed on the development PC
  (`C:\Users\MohammedFazil-PC\node_modules`, v1.59.1, with its Chromium).

**The builder's calls, made in this design (the owner may overrule any):**

- The till's phone layout is a bottom bill bar plus a bottom sheet (§7.1).
- Tablets keep the till side by side (§7.1).
- Tables become two-line rows with a "⋯" menu, extending the Cash book's
  existing pattern, rather than separate card lists (§6.6).
- Filters stay visible rather than going behind a Filters button (§6.5).
- Dialogs stay centred rather than becoming bottom sheets (§6.8).
- A Print button on the phone receipt page (§7.15).
- The cashier's back gesture closes the bill sheet (§7.1).
- The work branches from `test`, not `main` (§9).
- Desktop wins over §6.9 at exactly 1024px (§6.9).
- A till PC narrower than 1024px with a mouse keeps search autofocus and
  gets the side-by-side tablet till, an improvement on today's stacked one
  (§7.1).

## 11. Left to the builder

Exact class names and spacing; the fold width of each table; how the sheet
is built (Radix `Dialog` or CSS plus a small hook), within §4 and §7.1;
whether to extract shared pieces (paging footer, "⋯" row menu) into
`components/custom/`; how the screenshot comparison is scripted; the order
of commits within each page.
