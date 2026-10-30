# Sessions: sign-out, revocation and a fixed ten-hour sign-in

Status: implemented on `fix/auth-sessions` (2026-10-29). Supersedes the session
paragraphs of the product spec §7 (`2026-08-23-fastfood-billing-design.md`).

Revised 2026-10-30: `users.session_version` was dropped (migration 0014) in
favour of a password stamp; accounts are deleted rather than deactivated; and
a dead session now redirects to `/login` from a server action too. This
document describes the revised design.

## The problem

Signing out appeared to work — the browser landed on `/login` — but opening the
site again went straight back to the dashboard. Reviewing the code turned up
four more faults:

| #   | Fault                                                                                                                                      | Severity |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| 1   | Sign-out did not end the session on Netlify                                                                                                | Critical |
| 2   | A session could not be ended: deactivating a user or resetting a password left their cookie working, and the role was read from the cookie | High     |
| 3   | "8 hours, one shift" was really 8 hours since the last request; a till in use never signed out                                             | Medium   |
| 4   | The five-strikes lockout could be beaten by sending guesses together                                                                       | Medium   |
| 5   | An unknown username answered ~240 ms faster than a real one, revealing which usernames exist                                               | Low      |
| 6   | Sign-out redirected to an absolute URL built from `AUTH_URL`, sending a branch deploy, or a phone on the LAN, to another site              | Low      |

The product spec already required #2 ("Deactivated users are rejected by the
guard even if they hold a valid JWT", §7.2); the guard never did it.

## Why sign-out failed

Auth.js keeps the whole session in one encrypted cookie. Every time it reads a
session it re-encrypts it with a fresh expiry and sends the cookie back. The
proxy used Auth.js's `auth()` wrapper, so **every response the proxy touched
carried a new session cookie** — including the sign-out request itself:

```
POST /dashboard   (the Sign out button, a server action)

  proxy (auth() wrapper)   Set-Cookie: authjs.session-token=<fresh>; Expires=+8h
  logoutAction → signOut   Set-Cookie: authjs.session-token=;        Max-Age=0
```

A browser applies `Set-Cookie` headers in order; the last one wins.

- **`next dev`** put the proxy's cookie first and the page's last, so the
  deletion won and sign-out worked locally. Measured.
- **Netlify** runs the proxy as an edge function. `@netlify/plugin-nextjs`
  (`addMiddlewareHeaders`) takes the server's response, which already holds
  the deletion, and **appends** the proxy's cookies after it. The fresh session
  won.

The login page still appeared because Next renders `/login` inside the
sign-out response using the cookies as `signOut` left them. The browser kept
the fresh cookie, so the next visit was signed in.

On any host, a response already in flight when the user signs out (a link
prefetch, another tab) also comes back with a fresh session and undoes the
sign-out.

**The fix is not Netlify-specific.** Header order is each host's
implementation detail, and in-flight responses race everywhere. The proxy now
only _reads_ the cookie and never writes one, so there is a single writer and
order cannot matter.

## How it worked before

```
SIGN IN ─────────────────────────────────────────────────────────────────────
 LoginForm ──loginAction──▶ signIn("credentials") ──▶ authorize()
                              no user / inactive / locked ─▶ null   (instant)
                              bcrypt(password, hash)
                                wrong ─▶ registerFailedLogin()
                                         read count · +1 in JS · write back
                                right ─▶ clear count
                            ◀── Set-Cookie: session = encrypted { id, name,
                                             username, role }   exp now+8h

EVERY REQUEST ───────────────────────────────────────────────────────────────
 browser ──cookie──▶ proxy: auth() wrapper
                       no valid cookie ─▶ 302 /login?next=…
                       signed in on /login ─▶ 302 /dashboard
                       ALWAYS ─▶ Set-Cookie: session re-encrypted, exp now+8h
                     page / action: requireUser()
                       decrypts the cookie — never asks the database
                       role and name taken from the cookie

SIGN OUT ────────────────────────────────────────────────────────────────────
 Sign out ──POST /dashboard──▶ proxy:  Set-Cookie session=<fresh>    ①
                               action: Set-Cookie session=; Max-Age=0 ②
                                       redirect ▶ ${AUTH_URL}/login
            Netlify sends ② then ①  ─▶ browser keeps ① ─▶ still signed in

OWNER DEACTIVATES A CASHIER / RESETS A PASSWORD ────────────────────────────
 users row updated ─▶ nothing checks it ─▶ the cookie keeps working, and the
 proxy keeps extending it
```

## How it works now

```
SIGN IN ─────────────────────────────────────────────────────────────────────
 LoginForm ──loginAction──▶ signIn("credentials") ──▶ authorize()
                              no user / inactive ─▶ bcrypt vs DUMMY_HASH ─▶ null
                              claimSignInAttempt(id)        one atomic UPDATE:
                                count +1 · refuse if locked · lock at the 5th
                              bcrypt(password, hash)    (always, ~240 ms)
                              refused or wrong ─▶ null
                              right ─▶ clearFailedLogins()
                            ◀── Set-Cookie: session = encrypted { id, name,
                                  username, role, passwordStamp, signedInAt }
                                  exp sign-in + 10h
                              passwordStamp = HMAC(AUTH_SECRET, password hash)

EVERY REQUEST ───────────────────────────────────────────────────────────────
 browser ──cookie──▶ proxy: getToken()   READ ONLY — never sets a cookie
                       none, or signed in ≥ 10h ago ─▶ 302 /login?next=…
                     page / action: requireUser()
                       auth() decrypts; jwt callback ends it at 10h
                       findSessionUser(id)          one primary-key query
                       deleted (is_active = false), or the stamp of today's
                       password hash ≠ the cookie's
                         page and action alike ─▶ redirect /login
                       role and name taken from the database
                     /login: already signed in (checked against the DB)
                       ─▶ redirect /dashboard

SIGN OUT ────────────────────────────────────────────────────────────────────
 Sign out ──POST──▶ proxy:  (writes nothing)
                    action: Set-Cookie session=; Max-Age=0   — the only one
                            redirect ▶ /login   (relative)

OWNER DELETES AN ACCOUNT ────────────────────────────────────────────────────
 is_active = false ─▶ every cookie that user holds fails on its next request,
 page or action, and the browser lands on /login.

OWNER RESETS A PASSWORD ─────────────────────────────────────────────────────
 new hash ─▶ new stamp ─▶ every cookie from the old password fails on its next
 request. Owners resetting their own password are signed out here too, and
 sign in again with the new one.
```

**Why a password stamp, not a version column.** The cookie stores
`passwordStamp`, an HMAC of the user's bcrypt hash keyed with `AUTH_SECRET`
(`src/lib/auth/password-stamp.ts`). A reset writes a new hash, so the stamp
moves on its own and older cookies stop matching — Django ends sessions the
same way. The 2026-10-29 design kept a separate `session_version` counter;
its only other job was keeping old cookies dead through a reactivation, and
accounts are now deleted, not reactivated. Because the stamp is keyed, it
says nothing about the password even to the cookie's holder, who can read it
through `/api/auth/session`.

**Deleting an account.** A user row is never removed: `bills.created_by`,
`expenses.created_by` and `stock_movements.created_by` are `ON DELETE
RESTRICT`, bills are frozen by trigger, and receipts print the cashier's
name. Delete sets `is_active = false`, hides the account from the Users list
and keeps its username reserved. There is no undo in the app.

Owners who reset their own password are not signed straight back in. Setting
a cookie in a server action re-renders the page in the same response, and
Auth.js reads the session from the request headers, which still carry the old
cookie during that re-render. The page would see the old stamp and redirect
anyway. Signing out everywhere is also the safer rule after a password
change.

## The rules

All pure, in `src/lib/auth/session-policy.ts`, proven by `npm run verify:auth`:

- **A sign-in lasts 10 hours from sign-in** (`SESSION_MAX_AGE_SECONDS`), never
  extended. The cookie's expiry cannot enforce this alone: Auth.js still
  re-issues the cookie with a fresh expiry whenever `/api/auth/session` is
  read. So the token carries `signedInAt`, the `jwt` callback returns `null`
  once it is 10 hours old, and the proxy redirects it.
- **A session counts only while** the account is not deleted and the stamp
  of its current password hash equals the one in the cookie
  (`currentSessionUser`).
- **The proxy reads the cookie by the name Auth.js wrote** —
  `__Secure-authjs.session-token` on https, decided by `AUTH_URL` when set and
  by the request otherwise (`usesSecureCookie`). `getToken()` defaults to the
  plain name, which would make every Netlify request look signed out.

## Where each check runs

| Layer                          | Reads                    | Decides                                                      |
| ------------------------------ | ------------------------ | ------------------------------------------------------------ |
| `proxy.ts`                     | cookie only              | redirect to `/login` when there is no live cookie — courtesy |
| `(app)/layout.tsx`             | cookie only              | the name and links in the shell — display, never access      |
| every page, `requireUser()`    | cookie + one users query | access; redirects a dead session to `/login`                 |
| every action, inside `guarded` | cookie + one users query | access; redirects a dead session to `/login`                 |
| `/login`                       | cookie + one users query | send an already-signed-in user to the dashboard              |

React's `cache` shares the users query between a layout and its page. It does
nothing inside a server action, so each action makes its own — one lookup by
primary key.

The shell layout stays cookie-only on purpose: it renders on a full page load
and after sign-in, and a database read there would keep the whole screen blank
through a Neon cold start. Layouts are not re-rendered on client navigation,
so it could not be the gate anyway; the pages are.

`requireUser()` redirects a dead session from an action exactly as from a
page. Next rejects the caller's promise and navigates the browser to `/login`
itself, so no screen needs its own "signed out" handling. `guarded()` catches
every error to turn it into an `ActionResult`, so it lets Next's redirect
through with `unstable_rethrow`.

## Why not access and refresh tokens

That pattern exists for clients that cannot hold a server session cookie —
mobile apps, third-party API consumers, a front end calling an API on another
domain. Here browser and server are one origin, and the standard (OWASP
Session Management Cheat Sheet) is a server-issued session in an httpOnly
cookie, which this is. A refresh token would add a second secret to steal and
a rotation scheme, and would still need a server-side record to be revocable.
The guard's one lookup by primary key — `is_active` plus the password stamp —
gives that revocation, and keeps Auth.js, whose Credentials provider supports
only JWT sessions.

## Rolling it out

- **Migrations 0013 and 0014** add `users.session_version`, then drop it. The
  code reads neither, so they can run before or after the deploy. A database
  that never ran 0013 runs both and ends where it started.
- **Everyone signs in once after the deploy.** Cookies issued earlier carry no
  `passwordStamp` or `signedInAt`, so they are rejected.
- **A session that ends mid-sale.** At the 10-hour mark, Save on the till
  sends the cashier to `/login`, and the cart, which lives only in that tab's
  memory, is lost. Sign in again before the 10 hours run out on a long day.

## Verification

| Check                  | Proves                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| `npm run verify:auth`  | session rules, the 10-hour boundary, cookie naming, the dummy-hash timing (no DB)       |
| `npm run verify:users` | the stamp moves with a reset; five attempts lock; 12 sent at once let only five through |
| Manual, against dev    | an ordinary response sets no cookie; sign-out sends exactly one, the deletion           |
