import type { MetadataRoute } from "next";

/**
 * Lets the till be added to a tablet's home screen as "Mobito", with the
 * crimson brand mark as its icon. Colours are the `--background` and
 * `--sidebar` tokens from globals.css, as literals: a manifest cannot read CSS.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mobito Billing",
    short_name: "Mobito",
    description: "Counter billing for Mobito.",
    start_url: "/bill",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#1c1714",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
