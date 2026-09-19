import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { LoginForm } from "./components/LoginForm";

export function LoginPage() {
  return (
    <main className="bg-muted/40 flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Billing</CardTitle>
          <CardDescription>Sign in to start taking orders.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* LoginForm reads ?next= via useSearchParams, which needs a
              Suspense boundary to avoid opting the whole page out of static
              rendering. */}
          <Suspense fallback={<Skeleton className="h-56 w-full" />}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
