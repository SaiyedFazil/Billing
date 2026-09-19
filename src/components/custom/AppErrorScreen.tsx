"use client";

import { ShieldAlert, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What an (app) route segment shows when it throws. */
export function AppErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // requireSuperadmin() throws a GuardError with this wording.
  const isForbidden = error.message.includes("owner account");
  const Icon = isForbidden ? ShieldAlert : TriangleAlert;

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-3xl border bg-card px-8 py-10 text-center shadow-lift">
        <span
          className={cn(
            "flex size-14 items-center justify-center rounded-2xl",
            isForbidden
              ? "bg-warning-soft text-warning-ink"
              : "bg-destructive-soft text-destructive",
          )}
        >
          <Icon className="size-6" />
        </span>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight">
          {isForbidden ? "Not allowed" : "Something went wrong"}
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          {isForbidden
            ? "Only the owner account can open that page. Ask the owner if you need access."
            : "The page could not load. Try again — if it keeps happening, note the reference below."}
        </p>
        {error.digest && !isForbidden ? (
          <p className="rounded-lg bg-muted px-2.5 py-1 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {isForbidden ? null : <Button onClick={reset}>Try again</Button>}
          <Button variant="outline" asChild>
            <Link href="/bill">Back to billing</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
