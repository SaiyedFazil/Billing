"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function TableErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-destructive/25 bg-destructive-soft/40 px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive-soft text-destructive">
        <AlertCircle className="size-5" />
      </span>
      <p className="max-w-sm text-sm font-medium text-destructive-ink">
        {message}
      </p>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
