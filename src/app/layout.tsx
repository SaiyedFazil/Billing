import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";

import { AppProviders } from "@/components/providers/AppProviders";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for titles, totals and KPIs. The optical-size axis tightens
// the letterforms at large sizes.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

export const metadata: Metadata = {
  title: {
    default: "Mobito",
    template: "%s · Mobito",
  },
  description: "Counter billing for Mobito.",
  applicationName: "Mobito",
};

/**
 * Phones only; a desktop browser ignores both. The theme colour is the
 * `--sidebar` token as a literal, as in manifest.ts, so Android's browser bar
 * runs into the top bar. `resizes-content` shrinks the layout when the
 * keyboard opens, so dialogs and the bill sheet stay above it.
 */
export const viewport: Viewport = {
  themeColor: "#1c1714",
  interactiveWidget: "resizes-content",
};

/**
 * Providers only — deliberately no navigation here.
 *
 * That is what lets /print/[billId] render bare, with no navbar, while every
 * page under the (app) group gets the shell. See spec §13.2.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
