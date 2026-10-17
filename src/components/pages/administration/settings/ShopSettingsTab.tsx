"use client";

import { LocateFixed, ReceiptText } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { PaymentMethod } from "@/constants/payment-methods";
import {
  PRINTER_WIDTH_LABELS,
  PRINTER_WIDTHS,
  type PrinterWidth,
} from "@/lib/validation/settings-schema";

import { ExportAllCard } from "./components/ExportAllCard";
import { PaymentMethodsCard } from "./components/PaymentMethodsCard";
import { ReceiptPreviewDialog } from "./components/ReceiptPreviewDialog";
import {
  useShopSettingsTab,
  type SettingsFormState,
} from "./hooks/useShopSettingsTab";

const SECTION_LABEL =
  "text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase";

export function ShopSettingsTab({
  initial,
  paymentMethods,
}: {
  initial: SettingsFormState;
  paymentMethods: PaymentMethod[];
}) {
  const tab = useShopSettingsTab(initial);
  const { form, setForm, fieldErrors, isPending } = tab;
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop settings"
        description="Your shop's details, how its receipts print, and how it takes money."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => setPreviewOpen(true)}
          >
            <ReceiptText className="size-4" />
            Preview receipt
          </Button>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Shop details</CardTitle>
            <CardDescription>
              Printed at the top of every receipt. The name also appears in the
              sidebar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault();
                tab.submit();
              }}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
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

                <div className="space-y-2 sm:col-span-2">
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

                <div className="space-y-2 sm:col-span-2">
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
              </div>

              <Separator />

              <div className="space-y-2">
                <p className={SECTION_LABEL}>Business day</p>
                <Label htmlFor="shop-timezone">Timezone</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="shop-timezone"
                    className="sm:flex-1"
                    value={form.timezone}
                    disabled={isPending}
                    aria-invalid={Boolean(fieldErrors.timezone)}
                    aria-describedby="shop-timezone-hint"
                    onChange={(event) =>
                      setForm({ ...form, timezone: event.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending || tab.deviceTimezone === null}
                    onClick={tab.useDeviceTimezone}
                  >
                    <LocateFixed className="size-4" />
                    Use this device
                  </Button>
                </div>

                {fieldErrors.timezone ? (
                  <p className="text-sm text-destructive">
                    {fieldErrors.timezone}
                  </p>
                ) : null}

                {tab.timezoneDiffersFromDevice ? (
                  <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning-ink">
                    This device is set to{" "}
                    <strong className="font-semibold">
                      {tab.deviceTimezone}
                    </strong>
                    , which is not the shop&apos;s timezone.
                  </p>
                ) : null}

                <p
                  id="shop-timezone-hint"
                  className="text-xs text-pretty text-muted-foreground"
                >
                  Decides which day a sale counts towards and when bill
                  numbering restarts at #1. Changing it affects future bills
                  only — bills already issued keep the date they were given.
                </p>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isPending || !tab.isDirty}
              >
                {isPending ? "Saving…" : "Save settings"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <PaymentMethodsCard initial={paymentMethods} />
          <ExportAllCard />
        </div>
      </div>

      <ReceiptPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        shopName={form.shopName}
        addressLine={form.addressLine}
        phone={form.phone}
        receiptFooter={form.receiptFooter}
        printerWidth={form.printerWidth}
        timezone={form.timezone}
      />
    </div>
  );
}
