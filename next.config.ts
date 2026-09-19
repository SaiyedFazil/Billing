import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. Without this, Turbopack walks up and finds the
  // stray package-lock.json in the user's home directory.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  images: {
    // Item photos are served from ImageKit with on-the-fly transformations.
    remotePatterns: [{ protocol: "https", hostname: "ik.imagekit.io" }],
  },
};

export default nextConfig;
