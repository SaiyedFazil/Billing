"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  type AdjustMode,
  type AdjustReason,
  parseWholeQuantity,
  planAdjustment,
  REASONS_FOR_MODE,
} from "@/lib/utils/stock";
import {
  adjustStockAction,
  getStockHistoryAction,
} from "@/server/stock/stock-actions";
import type { AdminItemRow } from "@/types/item.types";
import type { StockMovementRow } from "@/types/stock.types";

/**
 * State for one opening of the Update stock dialog. The dialog remounts per
 * item, so this always starts clean.
 */
export function useUpdateStockDialog({
  item,
  onClose,
}: {
  item: AdminItemRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setModeState] = useState<AdjustMode>("ADD");
  const [quantityInput, setQuantityInput] = useState("");
  const [reason, setReason] = useState<AdjustReason>("RESTOCK");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [history, setHistory] = useState<StockMovementRow[] | null>(null);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [historyVersion, setHistoryVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getStockHistoryAction({ itemId: item.id }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setHistory(result.data);
        setHistoryFailed(false);
      } else {
        setHistoryFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, historyVersion]);

  const setMode = useCallback((next: AdjustMode) => {
    setModeState(next);
    // Each mode has its own reasons; keep the choice valid for the new one.
    setReason(REASONS_FOR_MODE[next][0]);
    setError(null);
  }, []);

  const quantity = parseWholeQuantity(quantityInput);
  const quantityValid = quantity !== null && (mode === "SET" || quantity >= 1);
  const plan =
    quantityValid && quantity !== null
      ? planAdjustment(item.stockQuantity, mode, quantity)
      : null;

  const inputError =
    quantityInput.trim() && !quantityValid
      ? "Enter a whole number" + (mode === "SET" ? "" : " of at least 1")
      : plan && !plan.ok
        ? plan.message
        : null;

  const canSubmit = Boolean(plan?.ok) && !isPending;

  const submit = useCallback(() => {
    if (!plan?.ok || quantity === null) return;
    setError(null);

    startTransition(async () => {
      const result = await adjustStockAction({
        itemId: item.id,
        mode,
        quantity,
        reason,
        note: note.trim() || null,
      });

      if (result.ok) {
        toast.success(
          `${item.name}: ${result.data.before} → ${result.data.after}`,
        );
        router.refresh();
        onClose();
        return;
      }

      // The count may have moved under the dialog; show the fresh one.
      setError(result.error.fields?.quantity ?? result.error.message);
      router.refresh();
      setHistoryVersion((version) => version + 1);
    });
  }, [item, mode, note, onClose, plan, quantity, reason, router]);

  return {
    mode,
    setMode,
    quantityInput,
    setQuantityInput,
    reason,
    setReason,
    reasons: REASONS_FOR_MODE[mode],
    note,
    setNote,
    plan,
    inputError,
    error,
    canSubmit,
    isPending,
    submit,
    history,
    historyFailed,
  };
}
