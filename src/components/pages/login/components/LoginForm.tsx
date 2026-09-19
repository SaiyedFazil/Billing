"use client";

import {
  AlertCircle,
  ArrowRight,
  Loader2,
  LockKeyhole,
  UserRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/users/login-action";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await loginAction(formData);

      if (result.ok) {
        // Only accept a same-site relative path, so ?next= cannot be used to
        // bounce the user to another origin after signing in.
        const next = searchParams.get("next");
        const destination =
          next && next.startsWith("/") && !next.startsWith("//")
            ? next
            : "/dashboard";

        router.push(destination);
        router.refresh();
        return;
      }

      setError(result.error.message);
      setFieldErrors(result.error.fields ?? {});
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="username">Username</Label>
        <div className="relative">
          <UserRound className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="username"
            name="username"
            autoComplete="username"
            autoFocus
            required
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.username)}
            className="h-13 rounded-[14px] pl-11 text-base md:text-base"
          />
        </div>
        {fieldErrors.username ? (
          <p className="text-sm text-destructive">{fieldErrors.username}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            disabled={isPending}
            aria-invalid={Boolean(fieldErrors.password)}
            className="h-13 rounded-[14px] pl-11 text-base md:text-base"
          />
        </div>
        {fieldErrors.password ? (
          <p className="text-sm text-destructive">{fieldErrors.password}</p>
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-destructive-soft px-3.5 py-3 text-sm font-medium text-destructive-ink"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        className="h-13 w-full rounded-[14px]"
        disabled={isPending}
      >
        {isPending ? (
          <>
            <Loader2 className="size-4.5 animate-spin" />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="size-4.5" />
          </>
        )}
      </Button>
    </form>
  );
}
