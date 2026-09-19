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
    <div className="border-destructive/25 bg-destructive-soft/40 flex flex-col items-center gap-3 rounded-[20px] border border-dashed px-6 py-12 text-center">
      <span className="bg-destructive-soft text-destructive flex size-12 items-center justify-center rounded-2xl">
        <AlertCircle className="size-5" />
      </span>
      <p className="text-destructive-ink max-w-sm text-sm font-medium">
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
