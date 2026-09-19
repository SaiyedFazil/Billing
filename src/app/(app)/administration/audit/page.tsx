import { AuditLogTab } from "@/components/pages/administration/audit/AuditLogTab";
import { AUDIT_ACTIONS, type AuditAction } from "@/constants/audit-actions";
import { requireSuperadmin } from "@/lib/auth/guard";
import { listAuditLog } from "@/server/audit/audit-queries";

export const metadata = {
  title: "Audit log",
  description: "Who changed what, and when.",
};

const PAGE_SIZE = 50;

export default async function Page({
  searchParams,
}: PageProps<"/administration/audit">) {
  // Layout and page render in parallel — this page needs its own guard.
  await requireSuperadmin();

  const params = await searchParams;

  const rawAction = typeof params.action === "string" ? params.action : "";
  const action = AUDIT_ACTIONS.includes(rawAction as AuditAction)
    ? (rawAction as AuditAction)
    : undefined;
  const page = Math.max(1, Number(params.page) || 1);

  const log = await listAuditLog({ action }, page, PAGE_SIZE);

  return <AuditLogTab log={log} action={action ?? ""} />;
}
