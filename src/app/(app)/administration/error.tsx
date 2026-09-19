"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // requireSuperadmin() throws a GuardError with this wording.
  const isForbidden = error.message.includes("owner account");

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">
        {isForbidden ? "Not allowed" : "Something went wrong"}
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        {isForbidden
          ? "Only the owner account can open that page. Ask the owner if you need access."
          : "The page could not load. Try again — if it keeps happening, note the reference below."}
      </p>
      {error.digest && !isForbidden ? (
        <p className="text-muted-foreground font-mono text-xs">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="flex gap-2">
        {isForbidden ? null : <Button onClick={reset}>Try again</Button>}
        <Button variant="outline" asChild>
          <Link href="/bill">Back to billing</Link>
        </Button>
      </div>
    </div>
  );
}
