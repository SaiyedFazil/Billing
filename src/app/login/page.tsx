import { redirect } from "next/navigation";

import { LoginPage } from "@/components/pages/login/LoginPage";
import { getSessionUser } from "@/lib/auth/guard";
import { REPORT_ROUTES } from "@/lib/routes/report-routes";

export const metadata = {
  title: "Sign in",
  description: "Sign in to the billing system.",
};

export default async function Page() {
  // Checked against the database, not just the cookie: a session the owner
  // has ended is still a cookie, and sending it to the dashboard would bounce
  // it straight back here.
  if (await getSessionUser()) redirect(REPORT_ROUTES.dashboard);

  return <LoginPage />;
}
