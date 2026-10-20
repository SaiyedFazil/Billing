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
  receiptShowLogo: boolean;
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

/** Every field is a string or a boolean, so comparing the keys is the whole comparison. */
function hasChanged(a: SettingsFormState, b: SettingsFormState): boolean {
  return (Object.keys(a) as Array<keyof SettingsFormState>).some(
    (field) => a[field] !== b[field],
  );
}

export function useShopSettingsTab(initial: SettingsFormState) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(initial);
  // What is currently saved. Compared against the form to decide whether there
  // is anything worth saving; re-baselined on a successful save rather than
  // from the refreshed props, so the button settles without a second render.
  const [saved, setSaved] = useState(initial);
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
    // Snapshotted before the await: the owner can keep typing while it saves,
    // and what lands in the database is this, not whatever the form holds when
    // the response comes back.
    const submitted = form;
    // Pressing Enter in a field submits the form too, so the "nothing has
    // changed" guard lives here rather than only on the button.
    if (!hasChanged(submitted, saved)) return;

    startTransition(async () => {
      const result = await updateSettingsAction({
        shopName: submitted.shopName,
        addressLine: submitted.addressLine || null,
        phone: submitted.phone || null,
        receiptFooter: submitted.receiptFooter || null,
        receiptShowLogo: submitted.receiptShowLogo,
        printerWidth: submitted.printerWidth,
        timezone: submitted.timezone,
      });

      if (result.ok) {
        setSaved(submitted);
        toast.success("Settings saved");
        router.refresh();
        return;
      }
      setFieldErrors(result.error.fields ?? {});
      toast.error(result.error.message);
    });
  }, [form, router, saved]);

  return {
    form,
    setForm,
    fieldErrors,
    submit,
    isPending,
    /** Nothing to save until a field differs from what is stored. */
    isDirty: hasChanged(form, saved),
    deviceTimezone,
    useDeviceTimezone,
    /** The saved zone and this device disagree — worth pointing out, not an error. */
    timezoneDiffersFromDevice:
      deviceTimezone !== null && deviceTimezone !== form.timezone,
  };
}
