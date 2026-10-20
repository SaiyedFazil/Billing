"use client";

import { ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { TableCard } from "@/components/custom/TableCard";
import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AUDIT_ACTION_LABELS, AUDIT_ACTIONS } from "@/constants/audit-actions";
import { ADMIN_ROUTES } from "@/lib/routes/administration-routes";
import type { AuditLogEntry, AuditLogPage } from "@/types/audit.types";

import { AUDIT_HEADERS, AuditTableRow } from "./AuditLogColumns";
import { AuditDiffDialog } from "./components/AuditDiffDialog";

export function AuditLogTab({
  log,
  action,
}: {
  log: AuditLogPage;
  action: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [inspecting, setInspecting] = useState<AuditLogEntry | null>(null);

  const lastPage = Math.max(1, Math.ceil(log.total / log.pageSize));

  function navigate(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === "ALL") params.delete(key);
      else params.set(key, value);
    }
    startTransition(() =>
      router.push(`${ADMIN_ROUTES.audit}?${params.toString()}`),
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every change to the menu, prices, accounts and settings — plus failed sign-ins and reprints."
      />

      <Select
        value={action || "ALL"}
        onValueChange={(value) => navigate({ action: value, page: "1" })}
      >
        <SelectTrigger
          aria-label="Filter by activity"
          className="w-72 shadow-card data-[size=default]:h-11"
        >
          <SelectValue placeholder="All activity" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">All activity</SelectItem>
          {AUDIT_ACTIONS.map((auditAction) => (
            <SelectItem key={auditAction} value={auditAction}>
              {AUDIT_ACTION_LABELS[auditAction]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {log.rows.length === 0 ? (
        <TableEmptyState icon={ShieldCheck} title="Nothing logged yet" />
      ) : (
        <TableCard
          footer={
            <>
              <p className="text-sm text-muted-foreground">
                Page{" "}
                <span className="font-semibold text-foreground tabular-nums">
                  {log.page}
                </span>{" "}
                of {lastPage} · {log.total} entries
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={log.page <= 1 || isPending}
                  onClick={() => navigate({ page: String(log.page - 1) })}
                >
                  <ChevronLeft />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={log.page >= lastPage || isPending}
                  onClick={() => navigate({ page: String(log.page + 1) })}
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </>
          }
        >
          <Table>
            <TableHeader>
              <TableRow>
                {AUDIT_HEADERS.map((header, index) => (
                  <TableHead
                    key={header || `col-${index}`}
                    className={
                      index === AUDIT_HEADERS.length - 1 ? "text-right" : ""
                    }
                  >
                    {header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.rows.map((row) => (
                <AuditTableRow
                  key={row.id}
                  row={row}
                  onInspect={setInspecting}
                />
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <AuditDiffDialog
        entry={inspecting}
        refs={log.refs}
        onOpenChange={(open) => {
          if (!open) setInspecting(null);
        }}
      />
    </div>
  );
}
