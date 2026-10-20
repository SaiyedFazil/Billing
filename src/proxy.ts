import NextAuth from "next-auth";

import { authConfig } from "@/auth.config";

// Next.js 16 renamed `middleware.ts` to `proxy.ts`. Uses the edge-safe config
// only — no database, no bcrypt.
//
// This is a REDIRECT CONVENIENCE, not access control. Real enforcement is
// requireUser() / requireSuperadmin() inside every action and page.
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
    return Response.redirect(new URL("/dashboard", req.nextUrl.origin));
  }
});

export const config = {
  // Everything except the auth endpoints and static assets. The brand logo,
  // app icons and manifest must load signed out too: the sign-in page shows
  // the logo, and the browser fetches the icons before anyone signs in.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|brand/|images).*)",
  ],
};
