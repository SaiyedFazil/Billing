"use server";

import { redirect } from "next/navigation";

import { signOut } from "@/auth";
import { AUTH_ROUTES } from "@/lib/routes/auth-routes";

export async function logoutAction() {
  // Auth.js would redirect to an absolute URL built from AUTH_URL, which sends
  // a branch deploy, or a phone reaching the dev server by IP, to another
  // site. Clear the cookie, then redirect relative to wherever the user is.
  await signOut({ redirect: false });
  redirect(AUTH_ROUTES.login);
}
