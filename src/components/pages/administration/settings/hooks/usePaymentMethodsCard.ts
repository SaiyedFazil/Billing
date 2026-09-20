"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/constants/payment-methods";
import { updatePaymentMethodsAction } from "@/server/settings/settings-actions";

/** Both sides are kept in PAYMENT_METHODS order, so joining is enough. */
function sameMethods(a: PaymentMethod[], b: PaymentMethod[]): boolean {
  return a.join() === b.join();
}

export function usePaymentMethodsCard(initial: PaymentMethod[]) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [enabled, setEnabled] = useState<PaymentMethod[]>(initial);
  // What is currently saved, re-baselined on a successful save.
  const [saved, setSaved] = useState<PaymentMethod[]>(initial);

  /**
   * The last method on cannot be switched off — the shop must always have a
   * way to take money. The switch is disabled in the UI, Zod rejects an empty
   * array, and a CHECK constraint refuses it at the database. This is the
   * friendliest of the three, not the only one.
   */
  const isLastEnabled = useCallback(
    (method: PaymentMethod) => enabled.length === 1 && enabled[0] === method,
    [enabled],
  );

  const toggle = useCallback((method: PaymentMethod, on: boolean) => {
    setEnabled((previous) => {
      if (!on && previous.length === 1 && previous[0] === method) {
        return previous;
      }
      const next = on
        ? [...previous, method]
        : previous.filter((existing) => existing !== method);
      // Keep canonical order so the till's buttons never reshuffle.
      return PAYMENT_METHODS.filter((candidate) => next.includes(candidate));
    });
  }, []);

  const submit = useCallback(() => {
    // Snapshotted before the await, so a switch flipped mid-save is not
    // mistaken for the set that actually landed in the database.
    const submitted = enabled;
    if (sameMethods(submitted, saved)) return;

    startTransition(async () => {
      const result = await updatePaymentMethodsAction({
        paymentMethods: submitted,
      });

      if (result.ok) {
        setSaved(submitted);
        toast.success("Payment methods saved");
        router.refresh();
        return;
      }
      toast.error(result.error.message);
    });
  }, [enabled, router, saved]);

  return {
    enabled,
    toggle,
    isLastEnabled,
    submit,
    isPending,
    /** Nothing to save until the switches differ from what is stored. */
    isDirty: !sameMethods(enabled, saved),
  };
}
