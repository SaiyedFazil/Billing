"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import type { PrinterWidth } from "@/lib/validation/settings-schema";
import { updateSettingsAction } from "@/server/settings/settings-actions";

export type SettingsFormState = {
  shopName: string;
  addressLine: string;
  phone: string;
  receiptFooter: string;
  printerWidth: PrinterWidth;
  timezone: string;
};

export function useShopSettingsTab(initial: SettingsFormState) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const submit = useCallback(() => {
    setFieldErrors({});
    startTransition(async () => {
      const result = await updateSettingsAction({
        shopName: form.shopName,
        addressLine: form.addressLine || null,
        phone: form.phone || null,
        receiptFooter: form.receiptFooter || null,
        printerWidth: form.printerWidth,
        timezone: form.timezone,
      });

      if (result.ok) {
        toast.success("Settings saved");
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router]);

  return { form, setForm, fieldErrors, submit, isPending };
}
