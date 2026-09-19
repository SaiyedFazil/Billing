import Link from "next/link";

import { BrandMark } from "@/components/layout/BrandMark";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-6 text-center">
      <BrandMark className="size-12 rounded-2xl" />
      <p className="font-heading text-brand text-7xl font-extrabold tracking-tight">
        404
      </p>
      <h1 className="font-heading text-2xl font-extrabold tracking-tight">
        Page not found
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        That page does not exist, or the bill you are looking for was removed.
      </p>
      <Button asChild size="lg">
        <Link href="/bill">Back to billing</Link>
      </Button>
    </div>
  );
}
