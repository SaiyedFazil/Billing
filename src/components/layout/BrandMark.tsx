import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * The crimson "m + smile" tile — the Mobito logo where the wordmark will not
 * fit, such as the slim sidebar. Its corners are part of the artwork, so do
 * not round it again. Decorative: put the accessible name on the link around it.
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mobito-mark.svg"
      alt=""
      aria-hidden
      width={512}
      height={512}
      className={cn("size-10 shrink-0", className)}
    />
  );
}
