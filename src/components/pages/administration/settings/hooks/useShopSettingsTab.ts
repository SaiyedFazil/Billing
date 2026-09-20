"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
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

/** The till's own timezone is a browser fact, so it has no server snapshot. */
const subscribeToNothing = () => () => {};

function readDeviceTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    // A locked-down browser can throw here; the shop setting still stands.
    return null;
  }
}

export function useShopSettingsTab(initial: SettingsFormState) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // The server cannot know the till's timezone, so it renders null and the
  // browser fills it in after hydration — reading it during render would
  // mismatch. The string is stable, so this never re-renders in a loop.
  const deviceTimezone = useSyncExternalStore(
    subscribeToNothing,
    readDeviceTimezone,
    () => null,
  );

  const useDeviceTimezone = useCallback(() => {
    if (!deviceTimezone) return;
    setForm((previous) => ({ ...previous, timezone: deviceTimezone }));
  }, [deviceTimezone]);

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

  return {
    form,
    setForm,
    fieldErrors,
    submit,
    isPending,
    deviceTimezone,
    useDeviceTimezone,
    /** The saved zone and this device disagree — worth pointing out, not an error. */
    timezoneDiffersFromDevice:
      deviceTimezone !== null && deviceTimezone !== form.timezone,
  };
}
