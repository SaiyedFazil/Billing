"use client";

import { TableEmptyState } from "@/components/custom/TableEmptyState";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { BillLedgerPage } from "@/types/report.types";

import { BILL_HEADERS, BillTableRow } from "./BillsColumns";
import { BillsTableToolbar } from "./components/BillsTableToolbar";
import { useBillsTab } from "./hooks/useBillsTab";

export function BillsTab({
  ledger,
  filters,
  cashiers,
}: {
  ledger: BillLedgerPage;
  filters: {
    from: string;
    to: string;
    cashierId: string;
    paymentMethod: string;
    billNumber: string;
  };
  cashiers: Array<{ id: string; name: string }>;
}) {
  const tab = useBillsTab();

  const lastPage = Math.max(1, Math.ceil(ledger.total / ledger.pageSize));
  const firstRow =
    ledger.total === 0 ? 0 : (ledger.page - 1) * ledger.pageSize + 1;
  const lastRow = Math.min(ledger.page * ledger.pageSize, ledger.total);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Bills</h1>
        <p className="text-muted-foreground text-sm">
          Every bill ever issued, including voided ones.
        </p>
      </div>

      <BillsTableToolbar
        {...filters}
        cashiers={cashiers}
        onFilterChange={tab.setFilter}
        disabled={tab.isPending}
      />

      {ledger.rows.length === 0 ? (
        <TableEmptyState
          title="No bills match"
          description="Try widening the date range or clearing a filter."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {BILL_HEADERS.map((header) => (
                  <TableHead key={header}>{header}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.rows.map((row) => (
                <BillTableRow key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Showing {firstRow}–{lastRow} of {ledger.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={ledger.page <= 1 || tab.isPending}
                onClick={() => tab.goToPage(ledger.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={ledger.page >= lastPage || tab.isPending}
                onClick={() => tab.goToPage(ledger.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
