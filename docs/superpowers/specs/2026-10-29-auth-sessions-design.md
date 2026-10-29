# Sessions: sign-out, revocation and a fixed ten-hour sign-in

Status: implemented on `fix/auth-sessions` (2026-10-29). Supersedes the session
paragraphs of the product spec §7 (`2026-08-23-fastfood-billing-design.md`).

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
                                  username, role, sessionVersion, signedInAt }
                                  exp sign-in + 10h

EVERY REQUEST ───────────────────────────────────────────────────────────────
 browser ──cookie──▶ proxy: getToken()   READ ONLY — never sets a cookie
                       none, or signed in ≥ 10h ago ─▶ 302 /login?next=…
                     page / action: requireUser()
                       auth() decrypts; jwt callback ends it at 10h
                       findSessionUser(id)          one primary-key query
                       inactive, or sessionVersion ≠ cookie's
                         page   ─▶ redirect /login
                         action ─▶ { ok: false, UNAUTHORIZED }
                       role and name taken from the database
                     /login: already signed in (checked against the DB)
                       ─▶ redirect /dashboard

SIGN OUT ────────────────────────────────────────────────────────────────────
 Sign out ──POST──▶ proxy:  (writes nothing)
                    action: Set-Cookie session=; Max-Age=0   — the only one
                            redirect ▶ /login   (relative)

OWNER DEACTIVATES / REACTIVATES / RESETS A PASSWORD ────────────────────────
 users.session_version + 1 ─▶ every cookie that user holds fails on its next
 request. Owners resetting their own password are signed straight back in on
 this device, so only their other devices drop out.
```

## The rules

All pure, in `src/lib/auth/session-policy.ts`, proven by `npm run verify:auth`:

- **A sign-in lasts 10 hours from sign-in** (`SESSION_MAX_AGE_SECONDS`), never
  extended. The cookie's expiry cannot enforce this alone: Auth.js still
  re-issues the cookie with a fresh expiry whenever `/api/auth/session` is
  read. So the token carries `signedInAt`, the `jwt` callback returns `null`
  once it is 10 hours old, and the proxy redirects it.
- **A session counts only while** the account is active and
  `users.session_version` equals the number in the cookie
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
| every action, inside `guarded` | cookie + one users query | access; returns `UNAUTHORIZED`                               |
| `/login`                       | cookie + one users query | send an already-signed-in user to the dashboard              |

React's `cache` shares the users query between a layout and its page. It does
nothing inside a server action, so each action makes its own — one lookup by
primary key.

The shell layout stays cookie-only on purpose: it renders on a full page load
and after sign-in, and a database read there would keep the whole screen blank
through a Neon cold start. Layouts are not re-rendered on client navigation,
so it could not be the gate anyway; the pages are.

`requireUser()` tells a page from an action through an `AsyncLocalStorage`
flag that `guarded()` sets. Every server action calls its guard inside
`guarded()`.

## Why not access and refresh tokens

That pattern exists for clients that cannot hold a server session cookie —
mobile apps, third-party API consumers, a front end calling an API on another
domain. Here browser and server are one origin, and the standard (OWASP
Session Management Cheat Sheet) is a server-issued session in an httpOnly
cookie, which this is. A refresh token would add a second secret to steal and
a rotation scheme, and would still need a server-side record to be revocable.
`session_version` gives that revocation with one indexed lookup, and keeps
Auth.js, whose Credentials provider supports only JWT sessions.

## Rolling it out

- **Migration 0013** adds `users.session_version integer NOT NULL DEFAULT 0`.
  It is additive: the code before this change ignores the column. Run it
  **before** deploying, because the new guard reads the column on every page.
- **Everyone signs in once after the deploy.** Cookies issued earlier carry no
  `sessionVersion` or `signedInAt`, so they are rejected.
- **A session that ends mid-sale.** At the 10-hour mark, Save on the till
  returns "You must be signed in." The cart lives only in that tab's memory:
  signing in again in another tab, then pressing Save in the original, keeps
  it.

## Verification

| Check                  | Proves                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `npm run verify:auth`  | session rules, the 10-hour boundary, cookie naming, the dummy-hash timing (no DB)        |
| `npm run verify:users` | session version defaults to 0; five attempts lock; 12 sent at once let only five through |
| Manual, against dev    | an ordinary response sets no cookie; sign-out sends exactly one, the deletion            |
