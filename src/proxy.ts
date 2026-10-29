import { getToken } from "next-auth/jwt";
import { type NextRequest, NextResponse } from "next/server";

import { usesSecureCookie } from "@/lib/auth/session-policy";
import { AUTH_ROUTES } from "@/lib/routes/auth-routes";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`.
//
// This is a REDIRECT CONVENIENCE, not access control. Real enforcement is
// requireUser() / requireSuperadmin() inside every action and page, which
// also check the session against the database. The proxy cannot: it may run
// at the edge, where the Neon Pool cannot connect.
//
// It only READS the session cookie and never writes one. Auth.js's `auth()`
// proxy wrapper re-issues the session cookie on every response, so the
// sign-out request came back with two cookies: signOut's deletion and the
// wrapper's fresh session. Netlify appends the proxy's cookies last, the fresh
// session won, and signing out did nothing.
//
// Signed-in visitors to /login are sent on by the login page itself, not
// here. A session the owner has ended still has a cookie; redirecting it from
// /login to a page that rejects it would loop.
const PUBLIC_ROUTES: string[] = [AUTH_ROUTES.login];

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) return;

  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
    secureCookie: usesSecureCookie(process.env.AUTH_URL, req.nextUrl.href),
  });

  if (!token) {
    const url = new URL(AUTH_ROUTES.login, req.nextUrl.origin);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
}

export const config = {
  // Everything except the auth endpoints and static assets. The brand logo,
  // app icons and manifest must load signed out too: the sign-in page shows
  // the logo, and the browser fetches the icons before anyone signs in.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|brand/|images).*)",
  ],
};
