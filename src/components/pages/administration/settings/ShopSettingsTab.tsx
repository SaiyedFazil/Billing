"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PRINTER_WIDTH_LABELS,
  PRINTER_WIDTHS,
  type PrinterWidth,
} from "@/lib/validation/settings-schema";

import { ExportAllCard } from "./components/ExportAllCard";
import { ReceiptPreview } from "./components/ReceiptPreview";
import {
  useShopSettingsTab,
  type SettingsFormState,
} from "./hooks/useShopSettingsTab";

export function ShopSettingsTab({ initial }: { initial: SettingsFormState }) {
  const tab = useShopSettingsTab(initial);
  const { form, setForm, fieldErrors, isPending } = tab;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop settings"
        description="These appear on every printed receipt."
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
            <CardDescription>
              Your shop name also appears in the sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                tab.submit();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="shop-name">Shop name</Label>
                <Input
                  id="shop-name"
                  value={form.shopName}
                  disabled={isPending}
                  aria-invalid={Boolean(fieldErrors.shopName)}
                  onChange={(event) =>
                    setForm({ ...form, shopName: event.target.value })
                  }
                />
                {fieldErrors.shopName ? (
                  <p className="text-sm text-destructive">
                    {fieldErrors.shopName}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="shop-address">Address</Label>
                <Input
                  id="shop-address"
                  value={form.addressLine}
                  disabled={isPending}
                  onChange={(event) =>
                    setForm({ ...form, addressLine: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shop-phone">Phone</Label>
                <Input
                  id="shop-phone"
                  value={form.phone}
                  disabled={isPending}
                  onChange={(event) =>
                    setForm({ ...form, phone: event.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="shop-footer">Receipt footer</Label>
                <Textarea
                  id="shop-footer"
                  rows={2}
                  value={form.receiptFooter}
                  disabled={isPending}
                  onChange={(event) =>
                    setForm({ ...form, receiptFooter: event.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  The thank-you line at the bottom of every receipt.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="shop-printer">Printer width</Label>
                  <Select
                    value={form.printerWidth}
                    disabled={isPending}
                    onValueChange={(value) =>
                      setForm({ ...form, printerWidth: value as PrinterWidth })
                    }
                  >
                    <SelectTrigger id="shop-printer" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRINTER_WIDTHS.map((width) => (
                        <SelectItem key={width} value={width}>
                          {PRINTER_WIDTH_LABELS[width]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="shop-timezone">Timezone</Label>
                  <Input
                    id="shop-timezone"
                    value={form.timezone}
                    disabled={isPending}
                    aria-invalid={Boolean(fieldErrors.timezone)}
                    onChange={(event) =>
                      setForm({ ...form, timezone: event.target.value })
                    }
                  />
                  {fieldErrors.timezone ? (
                    <p className="text-sm text-destructive">
                      {fieldErrors.timezone}
                    </p>
                  ) : null}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Changing the timezone affects which day future bills are counted
                against. Bills already issued keep the date they were given.
              </p>

              <Button type="submit" size="lg" disabled={isPending}>
                {isPending ? "Saving…" : "Save settings"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <ReceiptPreview
          shopName={form.shopName}
          addressLine={form.addressLine}
          phone={form.phone}
          receiptFooter={form.receiptFooter}
          printerWidth={form.printerWidth}
          timezone={form.timezone}
        />
      </div>

      <ExportAllCard />
    </div>
  );
}
