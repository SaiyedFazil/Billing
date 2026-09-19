import { redirect } from "next/navigation";

import { REPORT_ROUTES } from "@/lib/routes/report-routes";

export default function Page() {
  redirect(REPORT_ROUTES.dashboard);
}
