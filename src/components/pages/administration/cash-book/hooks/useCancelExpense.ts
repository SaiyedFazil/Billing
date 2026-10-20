"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";

import { cancelExpenseAction } from "@/server/expenses/expenses-actions";
import type { ExpenseRow } from "@/types/expense.types";

/** Cancelling asks why, then marks the expense — it is never deleted. */
export function useCancelExpense() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useState<ExpenseRow | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback((row: ExpenseRow) => {
    setTarget(row);
    setReason("");
    setError(null);
  }, []);

  const close = useCallback(() => setTarget(null), []);

  const confirm = useCallback(() => {
    if (!target) return;
    const row = target;
    setError(null);

    startTransition(async () => {
      const result = await cancelExpenseAction({ id: row.id, reason });

      if (result.ok) {
        toast.success("Expense cancelled");
        setTarget(null);
        router.refresh();
        return;
      }

      if (result.error.code === "VALIDATION") {
        setError(result.error.fields?.reason ?? result.error.message);
        return;
      }

      // Already cancelled, or gone, in another tab: show why and catch up.
      toast.error(result.error.message);
      setTarget(null);
      router.refresh();
    });
  }, [reason, router, target]);

  return { target, reason, setReason, error, isPending, ask, close, confirm };
}
