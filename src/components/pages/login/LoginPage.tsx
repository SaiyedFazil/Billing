import { Suspense } from "react";

import { BrandLogo } from "@/components/layout/BrandLogo";
import { Skeleton } from "@/components/ui/skeleton";

import { LoginBrandPanel } from "./components/LoginBrandPanel";
import { LoginForm } from "./components/LoginForm";

export function LoginPage() {
  return (
    <main className="flex min-h-screen">
      <LoginBrandPanel />

      <section className="flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-95 space-y-8">
          <div className="lg:hidden">
            <BrandLogo eager className="h-28" />
          </div>

          <div className="space-y-2">
            <h1 className="font-heading text-[34px] leading-tight font-extrabold tracking-tight sm:text-[38px]">
              Welcome back
            </h1>
            <p className="text-[15px] text-muted-foreground">
              Sign in to start taking orders.
            </p>
          </div>

          {/* LoginForm reads ?next= via useSearchParams, which needs a
              Suspense boundary to avoid opting the whole page out of static
              rendering. */}
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
