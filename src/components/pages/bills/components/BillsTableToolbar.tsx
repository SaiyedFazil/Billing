"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BILL_PAYMENT_METHOD_LABELS,
  BILL_PAYMENT_METHODS,
} from "@/constants/payment-methods";

const FIELD_LABEL = "text-muted-foreground text-xs font-semibold";

export function BillsTableToolbar({
  from,
  to,
  cashierId,
  paymentMethod,
  billNumber,
  cashiers,
  onFilterChange,
  disabled,
}: {
  from: string;
  to: string;
  cashierId: string;
  paymentMethod: string;
  billNumber: string;
  cashiers: Array<{ id: string; name: string }>;
  onFilterChange: (key: string, value: string | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[20px] border bg-card p-4 shadow-card">
      <div className="space-y-1.5">
        <Label htmlFor="bills-from" className={FIELD_LABEL}>
          From
        </Label>
        <Input
          id="bills-from"
          type="date"
          value={from}
          className="w-40"
          disabled={disabled}
          onChange={(event) => onFilterChange("from", event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bills-to" className={FIELD_LABEL}>
          To
        </Label>
        <Input
          id="bills-to"
          type="date"
          value={to}
          className="w-40"
          disabled={disabled}
          onChange={(event) => onFilterChange("to", event.target.value)}
        />
      </div>

      <div className="space-y-1.5">
        <Label className={FIELD_LABEL}>Cashier</Label>
        <Select
          value={cashierId || "ALL"}
          disabled={disabled}
          onValueChange={(value) => onFilterChange("cashierId", value)}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All cashiers</SelectItem>
            {cashiers.map((cashier) => (
              <SelectItem key={cashier.id} value={cashier.id}>
                {cashier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label className={FIELD_LABEL}>Payment</Label>
        <Select
          value={paymentMethod || "ALL"}
          disabled={disabled}
          onValueChange={(value) => onFilterChange("paymentMethod", value)}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All methods</SelectItem>
            {BILL_PAYMENT_METHODS.map((method) => (
              <SelectItem key={method} value={method}>
                {BILL_PAYMENT_METHOD_LABELS[method]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="bills-number" className={FIELD_LABEL}>
          Bill #
        </Label>
        <Input
          id="bills-number"
          inputMode="numeric"
          value={billNumber}
          placeholder="Any"
          className="w-28 font-mono"
          disabled={disabled}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "" || /^\d{0,6}$/.test(next)) {
              onFilterChange("billNumber", next || null);
            }
          }}
        />
      </div>
    </div>
  );
}
