import Link from "next/link";

import { BrandLogo } from "@/components/layout/BrandLogo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
      <BrandLogo variant="wordmark" eager className="h-16" />
      <p className="font-heading text-7xl font-extrabold tracking-tight text-brand">
        404
      </p>
      <h1 className="font-heading text-2xl font-extrabold tracking-tight">
        Page not found
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        That page does not exist, or the bill you are looking for was removed.
      </p>
      <Button asChild size="lg">
        <Link href="/bill">Back to billing</Link>
      </Button>
    </div>
  );
}
