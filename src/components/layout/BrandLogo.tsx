import Image from "next/image";

import { cn } from "@/lib/utils";

const LOGOS = {
  // Wordmark, smile and the "Taste without limits" tagline.
  full: {
    light: "/brand/mobito-logo.svg",
    dark: "/brand/mobito-logo-dark.svg",
    width: 1248,
    height: 757,
  },
  // No tagline: it cannot be read below about 160px wide.
  wordmark: {
    light: "/brand/mobito-wordmark.svg",
    dark: "/brand/mobito-wordmark-dark.svg",
    width: 1248,
    height: 666,
  },
} as const;

/**
 * The Mobito logo. `on` is the background it sits on: the crimson "mo" all
 * but vanishes on the espresso sidebar, so dark backgrounds get the version
 * with a cream "mo". Size it with a height class; the width follows.
 *
 * See docs/brand/README.md for which version goes where.
 */
export function BrandLogo({
  variant = "full",
  on = "light",
  alt = "Mobito",
  eager = false,
  className,
}: {
  variant?: keyof typeof LOGOS;
  on?: "light" | "dark";
  alt?: string;
  /** For a logo above the fold, so it is not lazy-loaded. */
  eager?: boolean;
  className?: string;
}) {
  const logo = LOGOS[variant];

  return (
    <Image
      src={logo[on]}
      alt={alt}
      width={logo.width}
      height={logo.height}
      loading={eager ? "eager" : undefined}
      className={cn("h-10 w-auto", className)}
    />
  );
}
